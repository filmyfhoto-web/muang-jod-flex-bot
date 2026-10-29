// NetTimer — หน้าจอหลัก

using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Media;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace NetTimer
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            bool created;
            using (Mutex mutex = new Mutex(true, "NetTimer_SingleInstance_8F2C", out created))
            {
                if (!created)
                {
                    MessageBox.Show("โปรแกรมจับเวลาเปิดอยู่แล้ว", "NetTimer", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Storage store = new Storage(Storage.ChooseDataDir(Application.StartupPath));
                MainForm form = new MainForm(store);
                Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { form.HandleError(e.Exception); };
                AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e) { store.Log("FATAL " + e.ExceptionObject); };
                Application.Run(form);
            }
        }
    }

    class MainForm : Form
    {
        public readonly Storage Store;
        public AppState St;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly Dictionary<int, RunningForm> running = new Dictionary<int, RunningForm>();
        DateTime lastSave = DateTime.Now;
        DateTime lastAlarm = DateTime.MinValue;
        DateTime today = DateTime.Today;
        decimal todayTotal;
        int todayCount;
        string loadInfo;

        Panel header;
        Label lblClock;
        DataGridView grid;
        ToolStripStatusLabel stMessage, stCount, stToday;
        const int ColLeft = 5, ColStatus = 7, ColAction = 8;

        public event EventHandler Ticked;

        public MainForm(Storage store)
        {
            Store = store;
            St = store.Load(out loadInfo);
            BuildUi();
            ReloadToday();
            RebuildList();
            timer.Interval = 1000;
            timer.Tick += delegate { OnTick(); };
            Shown += delegate { RecoverAndStart(); };
        }

        // ---------------- สร้างหน้าจอ ----------------
        void BuildUi()
        {
            Text = "NetTimer — โปรแกรมจับเวลาใช้อินเทอร์เน็ต";
            Font = Theme.Base;
            BackColor = Theme.Back;
            Size = new Size(1180, 720);
            MinimumSize = new Size(960, 560);
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;

            // แถบหัวโปรแกรม
            header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 66;
            header.Paint += PaintHeader;
            lblClock = new Label();
            lblClock.AutoSize = true;
            lblClock.Font = Theme.B(18f);
            lblClock.ForeColor = Color.White;
            lblClock.BackColor = Theme.Primary;
            header.Controls.Add(lblClock);
            header.Resize += delegate { PlaceClock(); header.Invalidate(); };

            // แถบเครื่องมือ (ไอคอนใหญ่)
            FlowLayoutPanel tools = new FlowLayoutPanel();
            tools.Dock = DockStyle.Top;
            tools.Height = 92;
            tools.BackColor = Color.White;
            tools.Padding = new Padding(8, 4, 8, 0);
            tools.WrapContents = false;
            tools.Controls.Add(Tool("รายการใช้งาน", "monitor", true, delegate { grid.Focus(); }));
            tools.Controls.Add(Tool("จัดการผู้ใช้", "users", false, delegate { ManageMembers(); }));
            tools.Controls.Add(Tool("ตั้งค่าราคา", "coins", false, delegate { EditPrices(); }));
            tools.Controls.Add(Tool("รายงาน", "report", false, delegate { ShowReport(); }));
            tools.Controls.Add(Tool("ตั้งค่า", "gear", false, delegate { EditSettings(); }));
            tools.Controls.Add(Tool("ออกจากโปรแกรม", "exit", false, delegate { Close(); }));
            Panel toolLine = new Panel();
            toolLine.Dock = DockStyle.Top;
            toolLine.Height = 1;
            toolLine.BackColor = Theme.Border;

            // หัวข้อตาราง + ปุ่มเริ่มใช้งานใหม่
            Panel titleRow = new Panel();
            titleRow.Dock = DockStyle.Top;
            titleRow.Height = 60;
            Label lblList = Theme.Lbl("รายการใช้งานปัจจุบัน", Theme.B(14f), Theme.Text);
            lblList.Location = new Point(14, 18);
            Button btnNew = Theme.BtnGreen("เริ่มใช้งานใหม่ (F2)", "plus", delegate { NewSession(); });
            titleRow.Controls.Add(lblList);
            titleRow.Controls.Add(btnNew);
            titleRow.Resize += delegate { btnNew.Location = new Point(titleRow.Width - btnNew.Width - 14, 8); };

            // ตารางรายการใช้งาน
            Panel gridBox = new Panel();
            gridBox.Dock = DockStyle.Fill;
            gridBox.Padding = new Padding(14, 0, 14, 10);
            grid = Theme.Grid();
            grid.Dock = DockStyle.Fill;
            grid.RowTemplate.Height = 40;
            Theme.Col(grid, "ลำดับ", 60, true);
            Theme.Col(grid, "รหัสผู้ใช้", 100, true);
            Theme.FillCol(Theme.Col(grid, "ชื่อผู้ใช้", 180, false));
            Theme.Col(grid, "เวลาเริ่ม", 100, true);
            Theme.Col(grid, "เวลาสิ้นสุด", 100, true);
            Theme.Col(grid, "เวลาที่เหลือ", 120, true).DefaultCellStyle.Font = Theme.B(11.5f);
            Theme.Col(grid, "ค่าบริการ", 100, true);
            Theme.Col(grid, "สถานะ", 140, true);
            Theme.Col(grid, "จัดการ", 120, true);
            grid.CellPainting += PaintCell;
            grid.CellClick += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0 || e.ColumnIndex != ColAction) return;
                Session ses = SessionAt(e.RowIndex);
                if (ses == null) return;
                if (ses.Pending) PayPending(ses); else StopSession(ses);
            };
            grid.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e)
            {
                if (e.RowIndex < 0 || e.ColumnIndex == ColAction) return;
                Open(SessionAt(e.RowIndex));
            };
            grid.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter) { e.Handled = true; Open(Selected()); }
            };
            grid.ContextMenuStrip = BuildMenu();
            grid.CellMouseDown += delegate(object s, DataGridViewCellMouseEventArgs e)
            {
                if (e.Button == MouseButtons.Right && e.RowIndex >= 0) grid.Rows[e.RowIndex].Selected = true;
            };
            gridBox.Controls.Add(grid);

            StatusStrip status = new StatusStrip();
            status.BackColor = Color.White;
            stMessage = new ToolStripStatusLabel();
            stMessage.Spring = true;
            stMessage.TextAlign = ContentAlignment.MiddleLeft;
            stCount = new ToolStripStatusLabel();
            stToday = new ToolStripStatusLabel();
            stToday.Font = Theme.Bold;
            stToday.ForeColor = Theme.Primary;
            status.Items.Add(stMessage);
            status.Items.Add(stCount);
            status.Items.Add(stToday);

            // ลำดับการ Add มีผลกับ Dock: ตัวที่ Fill ต้องมาก่อน
            Controls.Add(gridBox);
            Controls.Add(status);
            Controls.Add(titleRow);
            Controls.Add(toolLine);
            Controls.Add(tools);
            Controls.Add(header);

            FormClosing += OnClosing;
        }

        void PaintHeader(object sender, PaintEventArgs e)
        {
            Graphics g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using (LinearGradientBrush b = new LinearGradientBrush(header.ClientRectangle, Theme.PrimaryDark, Theme.Primary, 0f))
                g.FillRectangle(b, header.ClientRectangle);
            g.DrawImage(Icons.Get("wifi", 40, Color.White), 16, 12);
            Font big = Theme.B(19f);
            string title = St.Settings.ShopName;
            Size ts = TextRenderer.MeasureText(title, big);
            TextRenderer.DrawText(g, title, big, new Point(66, (header.Height - ts.Height) / 2), Color.White);
            TextRenderer.DrawText(g, "แบบชำระเงินก่อนเข้าใช้งาน", Theme.B(14f),
                new Rectangle(66 + ts.Width + 6, 0, 420, header.Height), Theme.Yellow, TextFormatFlags.VerticalCenter);
        }

        void PlaceClock()
        {
            lblClock.Location = new Point(header.Width - lblClock.Width - 18, (header.Height - lblClock.Height) / 2);
        }

        static Button Tool(string text, string icon, bool selected, EventHandler click)
        {
            Button b = new Button();
            b.Text = text;
            b.Size = new Size(130, 84);
            b.FlatStyle = FlatStyle.Flat;
            b.FlatAppearance.BorderSize = 0;
            b.FlatAppearance.MouseOverBackColor = Theme.LightBlue;
            b.BackColor = Color.White;
            b.UseVisualStyleBackColor = false;
            b.Font = selected ? Theme.Bold : Theme.Base;
            b.ForeColor = selected ? Theme.Primary : Theme.Text;
            b.Image = Icons.Get(icon, 34, selected ? Theme.Primary : Color.FromArgb(55, 65, 81));
            b.TextImageRelation = TextImageRelation.ImageAboveText;
            b.Cursor = Cursors.Hand;
            b.Margin = new Padding(2, 0, 2, 0);
            if (selected)
                b.Paint += delegate(object s, PaintEventArgs e)
                {
                    using (SolidBrush br = new SolidBrush(Theme.Primary))
                        e.Graphics.FillRectangle(br, 14, b.Height - 4, b.Width - 28, 4);
                };
            b.Click += click;
            return b;
        }

        ContextMenuStrip BuildMenu()
        {
            ContextMenuStrip m = new ContextMenuStrip();
            m.Font = Theme.Base;
            m.Items.Add("เปิดดู (Enter)", null, delegate { Open(Selected()); });
            m.Items.Add("ต่อเวลา (F3)", null, delegate { Extend(Selected()); });
            m.Items.Add("แก้ไขรายการ (F4)", null, delegate { EditSession(Selected()); });
            m.Items.Add("หยุดชั่วคราว / เล่นต่อ (F6)", null, delegate { TogglePause(Selected()); });
            m.Items.Add(new ToolStripSeparator());
            m.Items.Add("หยุดการใช้งาน (F9)", null, delegate { StopSession(Selected()); });
            m.Items.Add("ยกเลิกรายการ (Del)", null, delegate { CancelSession(Selected()); });
            return m;
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            switch (keyData)
            {
                case Keys.F1: ShowHelp(); return true;
                case Keys.F2: NewSession(); return true;
                case Keys.F3: Extend(Selected()); return true;
                case Keys.F4: EditSession(Selected()); return true;
                case Keys.F6: TogglePause(Selected()); return true;
                case Keys.F7: ShowReport(); return true;
                case Keys.F8: ManageMembers(); return true;
                case Keys.F9: StopSession(Selected()); return true;
                case Keys.Delete:
                    if (grid.Focused) { CancelSession(Selected()); return true; }
                    break;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        // ---------------- เปิดโปรแกรม / กู้คืนหลังไฟดับ ----------------
        void RecoverAndStart()
        {
            if (loadInfo != null) Theme.Warn(this, loadInfo);
            DateTime now = DateTime.Now;
            double offline = St.OfflineSeconds(now);
            bool count = true;
            int runningCount = St.Active.Count - St.PendingCount();
            if (runningCount > 0 && offline > 60)
            {
                int mins = (int)Math.Round(offline / 60);
                string msg = "พบรายการที่กำลังใช้งานค้างอยู่ " + runningCount + " รายการ\n"
                    + "(โปรแกรมปิดไป หรือ ไฟดับ/เครื่องค้าง ประมาณ " + Fmt.Minutes(mins) + ")\n\n"
                    + "ต้องการนับเวลาช่วงที่โปรแกรมปิดไปด้วยหรือไม่?\n\n"
                    + "  ใช่ = ลูกค้ายังใช้เครื่องอยู่ตลอด (นับเวลาต่อ)\n"
                    + "  ไม่ = ไฟดับทั้งร้าน ลูกค้าใช้ไม่ได้ (ไม่นับช่วงนั้น)";
                count = MessageBox.Show(this, msg, "กู้คืนรายการค้าง", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
            }
            St.Resume(now, count);
            Save();
            RebuildList();
            if (St.Active.Count > 0) Status("กู้คืนรายการค้าง " + St.Active.Count + " รายการเรียบร้อย", Color.DarkGreen);
            timer.Start();
            if (St.PendingCount() > 0) new RecoveryForm(this).ShowDialog(this);
            grid.Focus();
        }

        void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing && St.Active.Count > 0)
            {
                string msg = "ยังมีรายการใช้งานอยู่ " + St.Active.Count + " รายการ\n"
                    + "ปิดโปรแกรมได้ ข้อมูลไม่หาย เปิดใหม่รายการจะกลับมาเหมือนเดิม\n\nต้องการปิดโปรแกรมหรือไม่?";
                if (!Theme.Confirm(this, msg)) { e.Cancel = true; return; }
            }
            timer.Stop();
            St.Tick(DateTime.Now, null, null);
            Save();
        }

        public void HandleError(Exception ex)
        {
            Store.Log(ex.ToString());
            try { Save(); } catch (Exception) { }
            Status("เกิดข้อผิดพลาด: " + ex.Message + " (บันทึกไว้ใน error.log)", Color.Red);
        }

        // ---------------- นาฬิกา ----------------
        void OnTick()
        {
            DateTime now = DateTime.Now;
            List<Session> soon = new List<Session>();
            List<Session> ended = new List<Session>();
            St.Tick(now, soon, ended);
            lblClock.Text = now.ToString("HH:mm:ss");
            PlaceClock();
            UpdateRows();

            foreach (Session s in ended) Popup(s, true);
            foreach (Session s in soon) Popup(s, false);
            if (ended.Count > 0) Save();
            else if (soon.Count == 0 && St.Settings.Sound && (now - lastAlarm).TotalSeconds >= 60 && AnyTimeUp())
            {
                lastAlarm = now;
                SystemSounds.Exclamation.Play();
            }

            if ((now - lastSave).TotalSeconds >= 10) Save();
            if (now.Date != today) { today = now.Date; ReloadToday(); }
            if (Ticked != null) Ticked(this, EventArgs.Empty);
        }

        bool AnyTimeUp()
        {
            foreach (Session s in St.Active) if (s.IsTimeUp() && !s.Paused) return true;
            return false;
        }

        void Popup(Session s, bool ended)
        {
            lastAlarm = DateTime.Now;
            if (St.Settings.Sound) (ended ? SystemSounds.Exclamation : SystemSounds.Asterisk).Play();
            Status((ended ? "หมดเวลาใช้งาน: " : "ใกล้หมดเวลา: ") + s.MemberName, ended ? Color.Red : Color.DarkOrange);
            WarnPopup.ShowFor(this, s, ended);
            Flash();
        }

        [StructLayout(LayoutKind.Sequential)]
        struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }

        [DllImport("user32.dll")]
        static extern bool FlashWindowEx(ref FLASHWINFO info);

        void Flash()
        {
            if (Form.ActiveForm != null) return;
            try
            {
                FLASHWINFO f = new FLASHWINFO();
                f.cbSize = (uint)Marshal.SizeOf(typeof(FLASHWINFO));
                f.hwnd = Handle;
                f.dwFlags = 3 | 12; // FLASHW_ALL | FLASHW_TIMERNOFG
                FlashWindowEx(ref f);
            }
            catch (Exception) { }
        }

        public void Status(string text, Color color)
        {
            stMessage.Text = DateTime.Now.ToString("HH:mm") + "  " + text;
            stMessage.ForeColor = color;
        }

        public void Save()
        {
            lastSave = DateTime.Now;
            try { Store.Save(St); }
            catch (Exception ex)
            {
                Store.Log("SAVE " + ex);
                Status("บันทึกข้อมูลไม่สำเร็จ: " + ex.Message, Color.Red);
            }
        }

        void ReloadToday()
        {
            todayTotal = 0;
            todayCount = 0;
            try
            {
                foreach (HistoryRecord r in Store.LoadHistory(DateTime.Today, DateTime.Today))
                    if (r.Status != HistoryRecord.Cancelled) { todayTotal += r.Total; todayCount++; }
            }
            catch (Exception ex) { Store.Log("HISTORY " + ex); }
            UpdateTotals();
        }

        void UpdateTotals()
        {
            stCount.Text = "กำลังใช้งาน " + (St.Active.Count - St.PendingCount()) + " รายการ   ";
            stToday.Text = "วันนี้ " + todayCount + " รายการ  รายรับ " + Fmt.Money(todayTotal) + " บาท";
        }

        // ---------------- ตาราง ----------------
        public void RebuildList()
        {
            Session sel = Selected();
            grid.Rows.Clear();
            int i = 0;
            foreach (Session s in St.Active)
            {
                int row = grid.Rows.Add(RowValues(s, ++i));
                grid.Rows[row].Tag = s.Id;
            }
            if (sel != null) SelectRow(sel.Id);
            UpdateRows();
            UpdateTotals();
            header.Invalidate();
        }

        void UpdateRows()
        {
            for (int r = 0; r < grid.Rows.Count; r++)
            {
                Session s = SessionAt(r);
                if (s == null) { RebuildList(); return; }
                object[] values = RowValues(s, r + 1);
                for (int c = 0; c < values.Length; c++)
                    if (!Equals(grid.Rows[r].Cells[c].Value, values[c])) grid.Rows[r].Cells[c].Value = values[c];
                DataGridViewCellStyle st = grid.Rows[r].Cells[ColLeft].Style;
                Color fore = TimeColor(s);
                if (st.ForeColor != fore) { st.ForeColor = fore; st.SelectionForeColor = fore; }
            }
        }

        object[] RowValues(Session s, int no)
        {
            DateTime now = DateTime.Now;
            return new object[] {
                no.ToString(), s.MemberCode, s.MemberName,
                s.Pending ? "-" : s.StartTime.ToString("HH:mm"),
                s.Pending ? "-" : s.EndTime(now).ToString("HH:mm"),
                s.Pending ? Fmt.Minutes(s.PaidMinutes) : Fmt.Clock(s.RemainingSeconds()),
                Fmt.Money(s.PrepaidAmount), StatusText(s), s.Pending ? "ชำระเงิน" : "หยุด" };
        }

        Color TimeColor(Session s)
        {
            if (s.Pending || s.Paused) return Theme.Muted;
            double remain = s.RemainingSeconds();
            if (remain <= 0) return Theme.Red;
            if (remain <= St.Settings.WarnMinutes * 60.0) return Color.FromArgb(217, 119, 6);
            return Theme.Green;
        }

        public string StatusText(Session s)
        {
            if (s.Pending) return "รอชำระเงิน";
            if (s.Paused) return "หยุดชั่วคราว";
            double remain = s.RemainingSeconds();
            if (remain <= 0) return "หมดเวลา";
            if (remain <= St.Settings.WarnMinutes * 60.0) return "ใกล้หมดเวลา";
            return "กำลังใช้งาน";
        }

        public static void StatusColors(string status, out Color back, out Color fore)
        {
            switch (status)
            {
                case "รอชำระเงิน":
                case "หมดเวลา": back = Color.FromArgb(253, 226, 228); fore = Theme.Red; break;
                case "หยุดชั่วคราว": back = Color.FromArgb(229, 231, 235); fore = Theme.Muted; break;
                case "ใกล้หมดเวลา": back = Color.FromArgb(255, 243, 205); fore = Color.FromArgb(146, 64, 14); break;
                default: back = Color.FromArgb(220, 245, 226); fore = Color.FromArgb(21, 128, 61); break;
            }
        }

        public static void PaintStatusCell(DataGridViewCellPaintingEventArgs e)
        {
            e.PaintBackground(e.CellBounds, (e.State & DataGridViewElementStates.Selected) != 0);
            string text = Convert.ToString(e.Value);
            if (text.Length > 0 && text != "-")
            {
                Color back, fore;
                StatusColors(text, out back, out fore);
                Theme.Pill(e.Graphics, e.CellBounds, text, back, fore, Theme.Bold);
            }
            e.Handled = true;
        }

        void PaintCell(object sender, DataGridViewCellPaintingEventArgs e)
        {
            if (e.RowIndex < 0) return;
            if (e.ColumnIndex == ColStatus) PaintStatusCell(e);
            else if (e.ColumnIndex == ColAction)
            {
                e.PaintBackground(e.CellBounds, (e.State & DataGridViewElementStates.Selected) != 0);
                string text = Convert.ToString(e.Value);
                Theme.CellButton(e.Graphics, e.CellBounds, text, text == "หยุด" ? Theme.Red : Theme.Green, Theme.Bold);
                e.Handled = true;
            }
        }

        Session SessionAt(int row)
        {
            if (row < 0 || row >= grid.Rows.Count || grid.Rows[row].Tag == null) return null;
            return St.FindSession((int)grid.Rows[row].Tag);
        }

        Session Selected()
        {
            if (grid.SelectedRows.Count == 0) return null;
            return SessionAt(grid.SelectedRows[0].Index);
        }

        void SelectRow(int id)
        {
            foreach (DataGridViewRow r in grid.Rows)
                if (r.Tag != null && (int)r.Tag == id) { r.Selected = true; grid.CurrentCell = r.Cells[0]; }
        }

        bool Need(Session s)
        {
            if (s != null) return true;
            Theme.Warn(this, "กรุณาเลือกรายการในตารางก่อน");
            return false;
        }

        // ---------------- ขั้นตอนใช้งาน ----------------
        // 1. เลือกผู้ใช้ → 2. เลือกเวลาและชำระเงิน → 3. เริ่มใช้งาน
        void NewSession()
        {
            MembersForm pick = new MembersForm(this, true);
            if (pick.ShowDialog(this) != DialogResult.OK || pick.Chosen == null) return;
            Member m = pick.Chosen;
            Session existing = St.FindActiveForMember(m.Id);
            if (existing != null)
            {
                Theme.Warn(this, m.Name + " มีรายการใช้งานอยู่แล้ว");
                Open(existing);
                return;
            }
            // บันทึกเป็น "รอชำระเงิน" ทันที ถ้าไฟดับระหว่างนี้ รายการจะยังอยู่
            Session s = St.NewSession(m, DateTime.Now);
            Save();
            RebuildList();
            if (!ChooseAndPay(s)) { St.Active.Remove(s); Save(); RebuildList(); }
        }

        bool ChooseAndPay(Session s)
        {
            PackageForm f = new PackageForm(this, s, false);
            if (f.ShowDialog(this) != DialogResult.OK) return false;
            s.PaidMinutes = f.Minutes;
            s.PrepaidAmount = f.Price;
            St.StartSession(s, DateTime.Now);
            Save();
            RebuildList();
            SelectRow(s.Id);
            Status("เริ่มใช้งาน " + s.MemberName + " " + Fmt.Minutes(s.PaidMinutes) + " รับเงิน " + Fmt.Money(s.PrepaidAmount) + " บาท", Color.DarkGreen);
            Open(s);
            return true;
        }

        // ระหว่างเลือกเวลา บันทึกตัวเลือกไว้ (กันไฟดับ)
        public void DraftChanged(Session s, int minutes, decimal price)
        {
            if (!s.Pending) return;
            s.PaidMinutes = minutes;
            s.PrepaidAmount = price;
            Save();
            UpdateRows();
        }

        public void PayPending(Session s)
        {
            if (s != null && s.Pending) ChooseAndPay(s);
        }

        // เริ่มรายการค้างตามเวลาที่เลือกไว้แล้ว (จากหน้ารายการค้างชำระ)
        public void StartPendingAsIs(Session s)
        {
            if (s.PaidMinutes <= 0) { ChooseAndPay(s); return; }
            St.StartSession(s, DateTime.Now);
            Save();
            RebuildList();
            Status("เริ่มใช้งาน " + s.MemberName + " " + Fmt.Minutes(s.PaidMinutes), Color.DarkGreen);
        }

        public void Open(Session s)
        {
            if (s == null) return;
            if (s.Pending) { PayPending(s); return; }
            RunningForm f;
            if (running.TryGetValue(s.Id, out f) && !f.IsDisposed) { f.Activate(); return; }
            f = new RunningForm(this, s);
            running[s.Id] = f;
            int id = s.Id;
            f.FormClosed += delegate { running.Remove(id); };
            f.Show(this);
        }

        public void Extend(Session s)
        {
            if (!Need(s)) return;
            if (s.Pending) { PayPending(s); return; }
            PackageForm f = new PackageForm(this, s, true);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            St.Tick(DateTime.Now, null, null);
            s.PaidMinutes += f.Minutes;
            s.PrepaidAmount += f.Price;
            St.ResetWarnings(s);
            WarnPopup.CloseFor(s.Id);
            Save();
            UpdateRows();
            Status("ต่อเวลา " + s.MemberName + " +" + Fmt.Minutes(f.Minutes) + " (" + Fmt.Money(f.Price) + " บาท)", Color.DarkGreen);
        }

        public void StopSession(Session s)
        {
            if (!Need(s)) return;
            if (s.Pending) { CancelSession(s); return; }
            St.Tick(DateTime.Now, null, null);
            StopForm f = new StopForm(this, s);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            Session cur = St.FindSession(s.Id);
            if (cur == null) return;
            St.Tick(DateTime.Now, null, null);
            HistoryRecord r = HistoryRecord.FromSession(cur, HistoryRecord.Done, DateTime.Now, f.Extra);
            try { Store.AppendHistory(r); }
            catch (Exception ex)
            {
                Store.Log("HISTORY " + ex);
                Theme.Warn(this, "บันทึกประวัติไม่สำเร็จ: " + ex.Message + "\nรายการยังอยู่ ลองกดหยุดใหม่อีกครั้ง");
                return;
            }
            St.Active.Remove(cur);
            WarnPopup.CloseFor(cur.Id);
            Save();
            todayTotal += r.Total;
            todayCount++;
            RebuildList();
            Status("หยุดการใช้งาน " + cur.MemberName + " ยอดรวม " + Fmt.Money(r.Total) + " บาท", Color.DarkGreen);
        }

        public void CancelSession(Session s)
        {
            if (!Need(s)) return;
            string msg = "ยกเลิกรายการของ " + s.MemberName + " ?\n\n"
                + (s.Pending ? "รายการนี้ยังไม่ได้ชำระเงิน"
                    : "รายการจะถูกบันทึกในประวัติว่า \"ยกเลิก\" และไม่นับเป็นรายรับ"
                      + (s.PrepaidAmount > 0 ? "\n(อย่าลืมคืนเงิน " + Fmt.Money(s.PrepaidAmount) + " บาท ถ้ามี)" : ""));
            if (!Theme.Confirm(this, msg)) return;
            if (!s.Pending)
            {
                St.Tick(DateTime.Now, null, null);
                HistoryRecord r = HistoryRecord.FromSession(s, HistoryRecord.Cancelled, DateTime.Now, 0);
                r.Total = 0;
                try { Store.AppendHistory(r); }
                catch (Exception ex) { Store.Log("HISTORY " + ex); }
            }
            St.Active.Remove(s);
            WarnPopup.CloseFor(s.Id);
            Save();
            RebuildList();
            Status("ยกเลิกรายการ " + s.MemberName + " แล้ว", Color.DarkOrange);
        }

        public void EditSession(Session s)
        {
            if (!Need(s)) return;
            St.Tick(DateTime.Now, null, null);
            EditForm f = new EditForm(this, s);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            St.ResetWarnings(s);
            Save();
            RebuildList();
            Status("แก้ไขรายการ " + s.MemberName + " เรียบร้อย", Color.DarkGreen);
        }

        public void TogglePause(Session s)
        {
            if (!Need(s) || s.Pending) return;
            St.Tick(DateTime.Now, null, null);
            s.Paused = !s.Paused;
            s.LastTick = DateTime.Now;
            Save();
            UpdateRows();
            Status((s.Paused ? "หยุดเวลาชั่วคราว " : "เริ่มนับเวลาต่อ ") + s.MemberName, Theme.Primary);
        }

        // ---------------- เมนูอื่น ----------------
        void ManageMembers()
        {
            new MembersForm(this, false).ShowDialog(this);
            RebuildList();
        }

        void EditPrices()
        {
            new PriceForm(this).ShowDialog(this);
        }

        void EditSettings()
        {
            if (new SettingsForm(this).ShowDialog(this) != DialogResult.OK) return;
            foreach (Session s in St.Active) St.ResetWarnings(s);
            Save();
            RebuildList();
        }

        void ShowReport()
        {
            new ReportForm(Store).ShowDialog(this);
        }

        void ShowHelp()
        {
            MessageBox.Show(this,
                "ขั้นตอนใช้งาน\n"
                + "  1. กด \"เริ่มใช้งานใหม่\" (F2) → เลือกผู้ใช้ (หรือเพิ่มผู้ใช้ใหม่)\n"
                + "  2. เลือกเวลา → กด \"ชำระเงินและเริ่มใช้งาน\"\n"
                + "  3. ระบบนับเวลาถอยหลัง และเตือนเมื่อใกล้หมด/หมดเวลา\n\n"
                + "ปุ่มลัด: F2 เริ่มใช้งานใหม่ · Enter เปิดดู · F3 ต่อเวลา · F4 แก้ไข · F6 หยุดชั่วคราว\n"
                + "         F9 หยุดการใช้งาน · Del ยกเลิก · F7 รายงาน · F8 จัดการผู้ใช้\n"
                + "คลิกขวาที่รายการเพื่อดูคำสั่งทั้งหมด\n\n"
                + "ไฟดับ/เครื่องค้าง: ข้อมูลถูกบันทึกทุก 10 วินาที และทุกครั้งที่มีการเปลี่ยนแปลง\n"
                + "เปิดโปรแกรมใหม่ รายการที่ยังไม่ได้ชำระเงินและที่กำลังใช้งานจะกลับมาแสดงเหมือนเดิม\n\n"
                + "ที่เก็บข้อมูล: " + Store.Dir,
                "วิธีใช้งาน", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }
}
