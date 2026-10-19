// NetTimer — หน้าจอโปรแกรม (Windows Forms)

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Media;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

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

    // ตัวช่วยสร้างหน้าจอ
    static class UI
    {
        public static readonly Font Base = new Font("Tahoma", 10f);
        public static readonly Font Bold = new Font("Tahoma", 10f, FontStyle.Bold);
        public static readonly Font Big = new Font("Tahoma", 16f, FontStyle.Bold);

        public static Label Lbl(string text)
        {
            Label l = new Label();
            l.Text = text;
            l.AutoSize = true;
            l.Anchor = AnchorStyles.Left;
            l.Margin = new Padding(3, 6, 3, 3);
            return l;
        }

        public static Button Btn(string text, EventHandler click)
        {
            Button b = new Button();
            b.Text = text;
            b.AutoSize = true;
            b.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            b.Padding = new Padding(6, 3, 6, 3);
            if (click != null) b.Click += click;
            return b;
        }

        public static TextBox Box(int width)
        {
            TextBox t = new TextBox();
            t.Width = width;
            return t;
        }

        public static FlowLayoutPanel Flow()
        {
            FlowLayoutPanel f = new FlowLayoutPanel();
            f.AutoSize = true;
            f.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            f.WrapContents = false;
            f.Margin = new Padding(0);
            return f;
        }

        // ตาราง ป้ายชื่อ | ช่องกรอก
        public static TableLayoutPanel Form2()
        {
            TableLayoutPanel t = new TableLayoutPanel();
            t.ColumnCount = 2;
            t.AutoSize = true;
            t.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            t.Padding = new Padding(10);
            t.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            t.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            return t;
        }

        public static void Row(TableLayoutPanel t, string label, Control c)
        {
            t.Controls.Add(Lbl(label));
            t.Controls.Add(c);
        }

        public static void Dialog(Form f, string title)
        {
            f.Text = title;
            f.Font = Base;
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false;
            f.MinimizeBox = false;
            f.ShowInTaskbar = false;
            f.StartPosition = FormStartPosition.CenterParent;
            f.AutoSize = true;
            f.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        }

        // ปุ่ม ตกลง/ยกเลิก ท้ายหน้าต่าง
        public static FlowLayoutPanel OkCancel(Form f, string okText, EventHandler ok)
        {
            FlowLayoutPanel p = Flow();
            p.FlowDirection = FlowDirection.RightToLeft;
            p.Padding = new Padding(10, 0, 10, 10);
            Button cancel = Btn("ยกเลิก (Esc)", null);
            cancel.DialogResult = DialogResult.Cancel;
            Button okBtn = Btn(okText, ok);
            p.Controls.Add(cancel);
            p.Controls.Add(okBtn);
            f.AcceptButton = okBtn;
            f.CancelButton = cancel;
            return p;
        }

        // วางเนื้อหา + ปุ่ม ลงหน้าต่างที่ปรับขนาดตามเนื้อหา (ไม่ใช้ Dock เพราะ AutoSize ไม่นับขนาดตัวที่ Dock)
        public static void Finish(Form f, Control content, FlowLayoutPanel buttons)
        {
            TableLayoutPanel root = new TableLayoutPanel();
            root.ColumnCount = 1;
            root.AutoSize = true;
            root.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            root.Location = new Point(0, 0);
            buttons.Anchor = AnchorStyles.Right;
            root.Controls.Add(content);
            root.Controls.Add(buttons);
            f.Controls.Add(root);
        }

        public static void Warn(IWin32Window owner, string text)
        {
            MessageBox.Show(owner, text, "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        public static bool Confirm(IWin32Window owner, string text)
        {
            return MessageBox.Show(owner, text, "ยืนยัน", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
        }

        public static NumericUpDown Num(decimal max, int decimals)
        {
            NumericUpDown n = new NumericUpDown();
            n.Maximum = max;
            n.DecimalPlaces = decimals;
            n.Width = 110;
            n.ThousandsSeparator = true;
            return n;
        }
    }

    class Item
    {
        public readonly object Value;
        readonly string text;
        public Item(object value, string text) { Value = value; this.text = text; }
        public override string ToString() { return text; }
    }

    class FastListView : ListView
    {
        public FastListView() { DoubleBuffered = true; }
    }

    static class Combos
    {
        public static void Types(ComboBox cb, AppState st, int selectId)
        {
            cb.Items.Clear();
            foreach (UsageType t in st.UsageTypes)
            {
                int i = cb.Items.Add(new Item(t, t.Name + "  (" + Fmt.Money(t.RatePerHour) + " บาท/ชม.)"));
                if (t.Id == selectId) cb.SelectedIndex = i;
            }
            if (cb.SelectedIndex < 0 && cb.Items.Count > 0) cb.SelectedIndex = 0;
        }

        public static void Members(ComboBox cb, AppState st, int selectId)
        {
            cb.Items.Clear();
            cb.Items.Add(new Item(null, "— ลูกค้าทั่วไป —"));
            cb.SelectedIndex = 0;
            foreach (Member m in st.Members)
            {
                string text = (string.IsNullOrEmpty(m.Code) ? "" : m.Code + "  ") + m.Name;
                if (m.DiscountPercent > 0) text += "  (ลด " + Fmt.Money(m.DiscountPercent) + "%)";
                int i = cb.Items.Add(new Item(m, text));
                if (m.Id == selectId) cb.SelectedIndex = i;
            }
        }

        public static UsageType SelectedType(ComboBox cb)
        {
            Item it = cb.SelectedItem as Item;
            return it == null ? null : it.Value as UsageType;
        }

        public static Member SelectedMember(ComboBox cb)
        {
            Item it = cb.SelectedItem as Item;
            return it == null ? null : it.Value as Member;
        }
    }

    // ====================================================================
    // หน้าจอหลัก
    // ====================================================================
    class MainForm : Form
    {
        readonly Storage store;
        AppState st;
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        DateTime lastSave = DateTime.Now;
        DateTime lastAlarm = DateTime.MinValue;
        DateTime today = DateTime.Today;
        decimal todayTotal;
        int todayCount;
        bool syncing;
        string loadInfo;

        Label lblShop, lblClock, lblRate;
        ComboBox cbMachine, cbType, cbMember;
        TextBox tbAmount, tbMinutes;
        CheckBox chkOpen;
        FastListView lv;
        ToolStripStatusLabel stMessage, stCount, stToday;

        public MainForm(Storage store)
        {
            this.store = store;
            st = store.Load(out loadInfo);
            BuildUi();
            ReloadToday();
            ApplySettings();
            RebuildList();
            timer.Interval = 1000;
            timer.Tick += delegate { OnTick(); };
            Shown += delegate { RecoverAndStart(); };
        }

        // ---------------- สร้างหน้าจอ ----------------
        void BuildUi()
        {
            Text = "NetTimer — โปรแกรมจับเวลาใช้อินเทอร์เน็ต";
            Font = UI.Base;
            Size = new Size(1100, 700);
            MinimumSize = new Size(900, 520);
            StartPosition = FormStartPosition.CenterScreen;
            KeyPreview = true;

            // เมนู
            MenuStrip menu = new MenuStrip();
            ToolStripMenuItem mFile = new ToolStripMenuItem("ไฟล์");
            mFile.DropDownItems.Add(MenuItem("ประวัติ / รายการที่บันทึก", Keys.F7, delegate { ShowHistory(); }));
            mFile.DropDownItems.Add(MenuItem("เปิดโฟลเดอร์ข้อมูล", Keys.None, delegate { Process.Start("explorer.exe", "\"" + store.Dir + "\""); }));
            mFile.DropDownItems.Add(new ToolStripSeparator());
            mFile.DropDownItems.Add(MenuItem("ออกจากโปรแกรม", Keys.None, delegate { Close(); }));
            ToolStripMenuItem mData = new ToolStripMenuItem("ตั้งค่า");
            mData.DropDownItems.Add(MenuItem("รายการใช้งาน และ ราคาต่อชั่วโมง", Keys.None, delegate { EditUsageTypes(); }));
            mData.DropDownItems.Add(MenuItem("สมาชิก / ผู้ใช้งาน", Keys.F8, delegate { EditMembers(); }));
            mData.DropDownItems.Add(MenuItem("ตั้งค่าร้าน และ รายชื่อเครื่อง", Keys.None, delegate { EditSettings(); }));
            ToolStripMenuItem mHelp = new ToolStripMenuItem("ช่วยเหลือ");
            mHelp.DropDownItems.Add(MenuItem("วิธีใช้งาน", Keys.F1, delegate { ShowHelp(); }));
            menu.Items.Add(mFile);
            menu.Items.Add(mData);
            menu.Items.Add(mHelp);
            MainMenuStrip = menu;

            // หัวโปรแกรม
            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 44;
            header.BackColor = Color.FromArgb(30, 58, 95);
            lblShop = new Label();
            lblShop.Font = UI.Big;
            lblShop.ForeColor = Color.White;
            lblShop.AutoSize = true;
            lblShop.Location = new Point(10, 8);
            lblClock = new Label();
            lblClock.Font = UI.Big;
            lblClock.ForeColor = Color.White;
            lblClock.AutoSize = true;
            lblClock.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            header.Controls.Add(lblShop);
            header.Controls.Add(lblClock);
            header.Resize += delegate { lblClock.Location = new Point(header.Width - lblClock.Width - 12, 8); };

            // ส่วนเพิ่มรายการใหม่
            GroupBox entry = new GroupBox();
            entry.Text = "เพิ่มรายการใหม่  (เลือกเครื่อง → ใส่จำนวนเงิน → กด Enter)";
            entry.Font = UI.Bold;
            entry.Dock = DockStyle.Top;
            entry.Padding = new Padding(8, 4, 8, 4);

            TableLayoutPanel et = new TableLayoutPanel();
            et.Dock = DockStyle.Top;
            et.AutoSize = true;
            et.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            et.ColumnCount = 1;
            et.Font = UI.Base;

            FlowLayoutPanel row1 = UI.Flow();
            cbMachine = new ComboBox();
            cbMachine.Width = 120;
            cbType = new ComboBox();
            cbType.DropDownStyle = ComboBoxStyle.DropDownList;
            cbType.Width = 260;
            cbMember = new ComboBox();
            cbMember.DropDownStyle = ComboBoxStyle.DropDownList;
            cbMember.Width = 260;
            row1.Controls.Add(UI.Lbl("1. เครื่อง"));
            row1.Controls.Add(cbMachine);
            row1.Controls.Add(UI.Lbl("   รายการใช้งาน"));
            row1.Controls.Add(cbType);
            row1.Controls.Add(UI.Lbl("   สมาชิก"));
            row1.Controls.Add(cbMember);

            FlowLayoutPanel row2 = UI.Flow();
            tbAmount = UI.Box(80);
            tbMinutes = UI.Box(70);
            row2.Controls.Add(UI.Lbl("2. จ่ายเงิน"));
            row2.Controls.Add(tbAmount);
            row2.Controls.Add(UI.Lbl("บาท  ="));
            row2.Controls.Add(tbMinutes);
            row2.Controls.Add(UI.Lbl("นาที    "));
            foreach (int v in new int[] { 10, 20, 30, 40, 50, 100 })
            {
                int amount = v;
                Button q = UI.Btn(v.ToString(), delegate { tbAmount.Text = amount.ToString(); tbAmount.Focus(); tbAmount.SelectAll(); });
                q.MinimumSize = new Size(44, 0);
                row2.Controls.Add(q);
            }
            chkOpen = new CheckBox();
            chkOpen.Text = "เปิดเวลา (จ่ายตอนเลิก)";
            chkOpen.AutoSize = true;
            chkOpen.Margin = new Padding(12, 6, 3, 3);
            row2.Controls.Add(chkOpen);
            Button btnStart = UI.Btn("3. เริ่มจับเวลา (Enter)", delegate { StartSession(); });
            btnStart.Font = UI.Bold;
            btnStart.BackColor = Color.FromArgb(46, 160, 67);
            btnStart.ForeColor = Color.White;
            btnStart.Margin = new Padding(12, 2, 3, 2);
            row2.Controls.Add(btnStart);

            lblRate = UI.Lbl("");
            lblRate.ForeColor = Color.DimGray;

            et.Controls.Add(row1);
            et.Controls.Add(row2);
            et.Controls.Add(lblRate);
            entry.Controls.Add(et);
            // GroupBox.AutoSize ขยายเกินจริงในบางเครื่อง กำหนดความสูงจากเนื้อหาแทน
            et.SizeChanged += delegate { entry.Height = et.Bottom + entry.Padding.Bottom + 4; };

            cbType.SelectedIndexChanged += delegate { RecalcFromAmount(); };
            cbMember.SelectedIndexChanged += delegate { RecalcFromAmount(); };
            tbAmount.TextChanged += delegate { if (!syncing) RecalcFromAmount(); };
            tbMinutes.TextChanged += delegate { if (!syncing) RecalcFromMinutes(); };
            chkOpen.CheckedChanged += delegate
            {
                tbAmount.Enabled = tbMinutes.Enabled = !chkOpen.Checked;
                RecalcFromAmount();
            };
            KeyEventHandler enterStarts = delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter) { e.Handled = true; e.SuppressKeyPress = true; StartSession(); }
            };
            cbMachine.KeyDown += enterStarts;
            tbAmount.KeyDown += enterStarts;
            tbMinutes.KeyDown += enterStarts;
            cbMachine.SelectedIndexChanged += delegate { tbAmount.Focus(); };

            // ตารางรายการที่กำลังใช้งาน
            lv = new FastListView();
            lv.Dock = DockStyle.Fill;
            lv.View = View.Details;
            lv.FullRowSelect = true;
            lv.GridLines = true;
            lv.MultiSelect = false;
            lv.HideSelection = false;
            lv.Font = new Font("Tahoma", 11f);
            AddColumns(lv, new string[] { "เครื่อง", "ลูกค้า", "รายการใช้งาน", "เริ่ม", "ใช้ไป", "เหลือเวลา", "เวลาที่ซื้อ", "จ่ายแล้ว", "เก็บเพิ่ม", "สถานะ" },
                new int[] { 90, 170, 150, 70, 90, 120, 110, 80, 80, 150 });
            lv.DoubleClick += delegate { PaySelected(); };
            lv.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter) { e.Handled = true; PaySelected(); }
            };

            // ปุ่มด้านล่าง
            FlowLayoutPanel bottom = UI.Flow();
            bottom.Dock = DockStyle.Bottom;
            bottom.WrapContents = true;
            bottom.Padding = new Padding(6);
            Button btnPay = UI.Btn("ชำระเงิน / ปิดรายการ (F9)", delegate { PaySelected(); });
            btnPay.Font = UI.Bold;
            btnPay.BackColor = Color.FromArgb(255, 193, 7);
            bottom.Controls.Add(btnPay);
            bottom.Controls.Add(UI.Btn("เติมเวลา (F3)", delegate { TopUpSelected(); }));
            bottom.Controls.Add(UI.Btn("แก้ไขรายการ (F4)", delegate { EditSelected(); }));
            bottom.Controls.Add(UI.Btn("หยุดชั่วคราว / เล่นต่อ (F6)", delegate { TogglePauseSelected(); }));
            bottom.Controls.Add(UI.Btn("ยกเลิกรายการ (Del)", delegate { CancelSelected(); }));
            bottom.Controls.Add(UI.Btn("ประวัติ (F7)", delegate { ShowHistory(); }));

            StatusStrip status = new StatusStrip();
            stMessage = new ToolStripStatusLabel();
            stMessage.Spring = true;
            stMessage.TextAlign = ContentAlignment.MiddleLeft;
            stCount = new ToolStripStatusLabel();
            stToday = new ToolStripStatusLabel();
            stToday.Font = UI.Bold;
            status.Items.Add(stMessage);
            status.Items.Add(stCount);
            status.Items.Add(stToday);

            // ลำดับการ Add มีผลกับ Dock: ตัวที่ Fill ต้องมาก่อน
            Controls.Add(lv);
            Controls.Add(bottom);
            Controls.Add(status);
            Controls.Add(entry);
            Controls.Add(header);
            Controls.Add(menu);

            FormClosing += OnClosing;
        }

        static ToolStripMenuItem MenuItem(string text, Keys keys, EventHandler click)
        {
            ToolStripMenuItem m = new ToolStripMenuItem(text, null, click);
            if (keys != Keys.None) m.ShortcutKeys = keys;
            return m;
        }

        public static void AddColumns(ListView lv, string[] names, int[] widths)
        {
            for (int i = 0; i < names.Length; i++) lv.Columns.Add(names[i], widths[i]);
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            switch (keyData)
            {
                case Keys.F3: TopUpSelected(); return true;
                case Keys.F4: EditSelected(); return true;
                case Keys.F6: TogglePauseSelected(); return true;
                case Keys.F9: PaySelected(); return true;
                case Keys.Delete:
                    if (lv.Focused) { CancelSelected(); return true; }
                    break;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        void ApplySettings()
        {
            lblShop.Text = st.Settings.ShopName;
            int typeId = Combos.SelectedType(cbType) != null ? Combos.SelectedType(cbType).Id : 0;
            Member mem = Combos.SelectedMember(cbMember);
            Combos.Types(cbType, st, typeId);
            Combos.Members(cbMember, st, mem != null ? mem.Id : 0);
            string machine = cbMachine.Text;
            cbMachine.Items.Clear();
            cbMachine.Items.AddRange(st.Settings.MachineList());
            cbMachine.Text = machine.Length > 0 ? machine : NextFreeMachine();
            RecalcFromAmount();
        }

        // ---------------- เปิดโปรแกรม / กู้คืนหลังไฟดับ ----------------
        void RecoverAndStart()
        {
            if (loadInfo != null) UI.Warn(this, loadInfo);
            DateTime now = DateTime.Now;
            double offline = st.OfflineSeconds(now);
            bool count = true;
            if (st.Active.Count > 0 && offline > 60)
            {
                int mins = (int)Math.Round(offline / 60);
                string msg = "พบรายการที่ยังไม่ได้ชำระเงิน " + st.Active.Count + " รายการ\n"
                    + "(โปรแกรมปิดไป หรือ ไฟดับ/เครื่องค้าง ประมาณ " + Fmt.Minutes(mins) + ")\n\n"
                    + "ต้องการนับเวลาช่วงที่โปรแกรมปิดไปด้วยหรือไม่?\n\n"
                    + "  ใช่ = ลูกค้ายังใช้เครื่องอยู่ตลอด (นับเวลาต่อ)\n"
                    + "  ไม่ = ไฟดับทั้งร้าน ลูกค้าใช้ไม่ได้ (ไม่นับช่วงนั้น)";
                count = MessageBox.Show(this, msg, "กู้คืนรายการค้าง", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
            }
            st.Resume(now, count);
            if (st.Active.Count > 0)
                Status("กู้คืนรายการค้าง " + st.Active.Count + " รายการเรียบร้อย", Color.DarkGreen);
            Save();
            RebuildList();
            timer.Start();
            tbAmount.Focus();
        }

        void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing && st.Active.Count > 0)
            {
                string msg = "ยังมีรายการที่ยังไม่ได้ชำระเงิน " + st.Active.Count + " รายการ\n"
                    + "ปิดโปรแกรมได้ ข้อมูลไม่หาย เปิดใหม่รายการจะกลับมาเหมือนเดิม\n\nต้องการปิดโปรแกรมหรือไม่?";
                if (!UI.Confirm(this, msg)) { e.Cancel = true; return; }
            }
            timer.Stop();
            st.Tick(DateTime.Now, null, null);
            Save();
        }

        public void HandleError(Exception ex)
        {
            store.Log(ex.ToString());
            try { Save(); } catch (Exception) { }
            Status("เกิดข้อผิดพลาด: " + ex.Message + " (บันทึกไว้ใน error.log)", Color.Red);
        }

        // ---------------- นาฬิกา ----------------
        void OnTick()
        {
            DateTime now = DateTime.Now;
            List<Session> soon = new List<Session>();
            List<Session> ended = new List<Session>();
            st.Tick(now, soon, ended);
            lblClock.Text = now.ToString("HH:mm:ss");
            lblClock.Location = new Point(lblClock.Parent.Width - lblClock.Width - 12, 8);
            UpdateRows();

            if (ended.Count > 0)
            {
                Save();
                Alert(Names(ended) + " หมดเวลาแล้ว!", SystemSounds.Exclamation, true);
            }
            else if (soon.Count > 0)
            {
                Alert(Names(soon) + " เหลือเวลาไม่เกิน " + st.Settings.WarnMinutes + " นาที", SystemSounds.Asterisk, false);
            }
            else if (st.Settings.Sound && (now - lastAlarm).TotalSeconds >= 60 && AnyTimeUp())
            {
                lastAlarm = now;
                SystemSounds.Exclamation.Play();
            }

            if ((now - lastSave).TotalSeconds >= 10) Save();
            if (now.Date != today) { today = now.Date; ReloadToday(); }
        }

        bool AnyTimeUp()
        {
            foreach (Session s in st.Active) if (s.IsTimeUp() && !s.Paused) return true;
            return false;
        }

        static string Names(List<Session> list)
        {
            List<string> names = new List<string>();
            foreach (Session s in list) names.Add(s.Machine);
            return "เครื่อง " + string.Join(", ", names.ToArray());
        }

        void Alert(string text, SystemSound sound, bool urgent)
        {
            Status(text, urgent ? Color.Red : Color.DarkOrange);
            lastAlarm = DateTime.Now;
            if (st.Settings.Sound) sound.Play();
            Flash();
        }

        [StructLayout(LayoutKind.Sequential)]
        struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }

        [DllImport("user32.dll")]
        static extern bool FlashWindowEx(ref FLASHWINFO info);

        void Flash()
        {
            if (Form.ActiveForm == this) return;
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

        void Status(string text, Color color)
        {
            stMessage.Text = DateTime.Now.ToString("HH:mm") + "  " + text;
            stMessage.ForeColor = color;
        }

        void Save()
        {
            lastSave = DateTime.Now;
            try { store.Save(st); }
            catch (Exception ex)
            {
                store.Log("SAVE " + ex);
                Status("บันทึกข้อมูลไม่สำเร็จ: " + ex.Message, Color.Red);
            }
        }

        void ReloadToday()
        {
            todayTotal = 0;
            todayCount = 0;
            try
            {
                foreach (HistoryRecord r in store.LoadHistory(DateTime.Today, DateTime.Today))
                {
                    if (r.Status != HistoryRecord.Cancelled) { todayTotal += r.Total; todayCount++; }
                }
            }
            catch (Exception ex) { store.Log("HISTORY " + ex); }
            UpdateTotals();
        }

        void UpdateTotals()
        {
            stCount.Text = "กำลังใช้ " + st.Active.Count + " เครื่อง";
            stToday.Text = "วันนี้ " + todayCount + " รายการ  รายรับ " + Fmt.Money(todayTotal) + " บาท";
        }

        // ---------------- ตารางรายการ ----------------
        List<Session> SortedActive()
        {
            List<string> order = new List<string>(st.Settings.MachineList());
            List<Session> list = new List<Session>(st.Active);
            list.Sort(delegate(Session a, Session b)
            {
                int ia = order.IndexOf(a.Machine), ib = order.IndexOf(b.Machine);
                if (ia < 0) ia = int.MaxValue;
                if (ib < 0) ib = int.MaxValue;
                if (ia != ib) return ia.CompareTo(ib);
                int c = string.Compare(a.Machine, b.Machine, StringComparison.OrdinalIgnoreCase);
                return c != 0 ? c : a.Id.CompareTo(b.Id);
            });
            return list;
        }

        void RebuildList()
        {
            Session sel = SelectedSession();
            lv.BeginUpdate();
            lv.Items.Clear();
            foreach (Session s in SortedActive())
            {
                ListViewItem it = new ListViewItem(RowTexts(s));
                it.Tag = s.Id;
                it.BackColor = RowColor(s);
                lv.Items.Add(it);
                if (sel != null && sel.Id == s.Id) it.Selected = true;
            }
            if (lv.SelectedItems.Count == 0 && lv.Items.Count > 0) lv.Items[0].Selected = true;
            lv.EndUpdate();
            UpdateTotals();
        }

        void UpdateRows()
        {
            foreach (ListViewItem it in lv.Items)
            {
                Session s = st.FindSession((int)it.Tag);
                if (s == null) { RebuildList(); return; }
                string[] texts = RowTexts(s);
                for (int i = 0; i < texts.Length; i++)
                    if (it.SubItems[i].Text != texts[i]) it.SubItems[i].Text = texts[i];
                Color c = RowColor(s);
                if (it.BackColor != c) it.BackColor = c;
            }
        }

        string[] RowTexts(Session s)
        {
            double remain = s.RemainingSeconds();
            string left = s.OpenTime ? "เปิดเวลา" : remain > 0 ? Fmt.Duration(remain) : "เกิน " + Fmt.Duration(-remain);
            string bought = s.OpenTime ? "-" : Fmt.Minutes(s.PaidMinutes);
            decimal extra = Pricing.ExtraDue(s, st.Settings.GraceMinutes);
            string state;
            if (s.Paused) state = "หยุดชั่วคราว";
            else if (s.OpenTime) state = "กำลังใช้ (เปิดเวลา)";
            else if (remain <= 0) state = "หมดเวลา!";
            else if (remain <= st.Settings.WarnMinutes * 60.0) state = "ใกล้หมดเวลา";
            else state = "กำลังใช้";
            return new string[] {
                s.Machine, s.MemberName, s.UsageName, s.StartTime.ToString("HH:mm"),
                Fmt.Duration(s.UsedSeconds), left, bought, Fmt.Money(s.PrepaidAmount),
                extra > 0 ? Fmt.Money(extra) : "", state };
        }

        Color RowColor(Session s)
        {
            if (s.Paused) return Color.Gainsboro;
            if (s.OpenTime) return Color.FromArgb(225, 240, 255);
            double remain = s.RemainingSeconds();
            if (remain <= 0) return Color.FromArgb(255, 170, 170);
            if (remain <= st.Settings.WarnMinutes * 60.0) return Color.FromArgb(255, 236, 150);
            return Color.White;
        }

        Session SelectedSession()
        {
            if (lv.SelectedItems.Count == 0) return null;
            return st.FindSession((int)lv.SelectedItems[0].Tag);
        }

        Session RequireSelected()
        {
            Session s = SelectedSession();
            if (s == null) UI.Warn(this, "กรุณาเลือกรายการในตารางก่อน");
            return s;
        }

        // ---------------- เพิ่มรายการ ----------------
        void RecalcFromAmount()
        {
            UsageType t = Combos.SelectedType(cbType);
            Member m = Combos.SelectedMember(cbMember);
            if (t == null) return;
            decimal disc = m != null ? m.DiscountPercent : 0;
            decimal rate = Pricing.EffectiveRate(t.RatePerHour, disc);
            lblRate.Text = "อัตรา " + Fmt.Money(t.RatePerHour) + " บาท/ชม."
                + (disc > 0 ? "  สมาชิกลด " + Fmt.Money(disc) + "% เหลือ " + Fmt.Money(Math.Round(rate, 2)) + " บาท/ชม." : "")
                + "   ·   F3 เติมเวลา  F4 แก้ไข  F6 หยุด/ต่อ  F9 ชำระเงิน  F7 ประวัติ";
            decimal amount;
            if (chkOpen.Checked || !Fmt.TryMoney(tbAmount.Text, out amount)) return;
            syncing = true;
            tbMinutes.Text = amount > 0 ? Pricing.MinutesFor(amount, t.RatePerHour, disc).ToString() : "";
            syncing = false;
        }

        void RecalcFromMinutes()
        {
            UsageType t = Combos.SelectedType(cbType);
            Member m = Combos.SelectedMember(cbMember);
            int minutes;
            if (t == null || !int.TryParse(tbMinutes.Text.Trim(), out minutes)) return;
            syncing = true;
            tbAmount.Text = minutes > 0 ? Fmt.Money(Pricing.AmountFor(minutes, t.RatePerHour, m != null ? m.DiscountPercent : 0)) : "";
            syncing = false;
        }

        string NextFreeMachine()
        {
            foreach (string m in st.Settings.MachineList())
                if (st.FindActiveOnMachine(m) == null) return m;
            return "";
        }

        void StartSession()
        {
            string machine = cbMachine.Text.Trim();
            if (machine.Length == 0) { UI.Warn(this, "กรุณาเลือกหรือพิมพ์ชื่อเครื่อง"); cbMachine.Focus(); return; }
            if (st.FindActiveOnMachine(machine) != null)
            {
                UI.Warn(this, "เครื่อง " + machine + " กำลังใช้งานอยู่\nถ้าลูกค้าต้องการเพิ่มเวลา ให้เลือกรายการแล้วกด \"เติมเวลา (F3)\"");
                return;
            }
            UsageType t = Combos.SelectedType(cbType);
            if (t == null) { UI.Warn(this, "กรุณาเพิ่มรายการใช้งานในเมนู ตั้งค่า ก่อน"); return; }
            Member m = Combos.SelectedMember(cbMember);

            decimal amount = 0;
            int minutes = 0;
            if (!chkOpen.Checked)
            {
                if (!Fmt.TryMoney(tbAmount.Text, out amount)) { UI.Warn(this, "จำนวนเงินไม่ถูกต้อง"); tbAmount.Focus(); return; }
                int.TryParse(tbMinutes.Text.Trim(), out minutes);
                if (minutes <= 0)
                {
                    UI.Warn(this, "กรุณาใส่จำนวนเงิน หรือ จำนวนนาที\n(หรือติ๊ก \"เปิดเวลา\" ถ้าจะให้จ่ายตอนเลิก)");
                    tbAmount.Focus();
                    return;
                }
            }

            Session s = new Session();
            s.Id = st.NextSessionId++;
            s.Machine = machine;
            s.UsageTypeId = t.Id;
            s.UsageName = t.Name;
            s.RatePerHour = t.RatePerHour;
            s.MemberId = m != null ? m.Id : 0;
            s.MemberName = m != null ? m.Name : "ลูกค้าทั่วไป";
            s.DiscountPercent = m != null ? m.DiscountPercent : 0;
            s.StartTime = s.LastTick = DateTime.Now;
            s.OpenTime = chkOpen.Checked;
            s.PaidMinutes = minutes;
            s.PrepaidAmount = amount;
            s.Note = "";
            st.Active.Add(s);
            Save();
            RebuildList();
            SelectSession(s.Id);
            Status("เริ่มจับเวลา " + machine + (s.OpenTime ? " (เปิดเวลา)" : "  " + Fmt.Minutes(minutes) + "  รับเงิน " + Fmt.Money(amount) + " บาท"), Color.DarkGreen);

            // พร้อมรับลูกค้าคนต่อไป: เลือกเครื่องว่างถัดไปให้เลย
            syncing = true;
            tbAmount.Text = "";
            tbMinutes.Text = "";
            syncing = false;
            chkOpen.Checked = false;
            cbMember.SelectedIndex = 0;
            cbMachine.Text = NextFreeMachine();
            tbAmount.Focus();
        }

        void SelectSession(int id)
        {
            foreach (ListViewItem it in lv.Items)
            {
                if ((int)it.Tag == id) { it.Selected = true; it.EnsureVisible(); }
                else it.Selected = false;
            }
        }

        // ---------------- จัดการรายการ ----------------
        void PaySelected()
        {
            Session s = RequireSelected();
            if (s == null) return;
            st.Tick(DateTime.Now, null, null);
            PayForm f = new PayForm(s, st.Settings.GraceMinutes);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            Session cur = st.FindSession(s.Id);
            if (cur == null) return;
            HistoryRecord r = HistoryRecord.FromSession(cur, HistoryRecord.Paid, DateTime.Now, f.Extra);
            try { store.AppendHistory(r); }
            catch (Exception ex)
            {
                store.Log("HISTORY " + ex);
                UI.Warn(this, "บันทึกประวัติไม่สำเร็จ: " + ex.Message + "\nรายการยังอยู่ ลองกดชำระเงินใหม่อีกครั้ง");
                return;
            }
            st.Active.Remove(cur);
            Save();
            todayTotal += r.Total;
            todayCount++;
            RebuildList();
            Status("ชำระเงิน " + cur.Machine + " เรียบร้อย ยอดรวม " + Fmt.Money(r.Total) + " บาท", Color.DarkGreen);
            if (st.FindActiveOnMachine(cbMachine.Text.Trim()) != null || cbMachine.Text.Trim().Length == 0)
                cbMachine.Text = cur.Machine;
        }

        void TopUpSelected()
        {
            Session s = RequireSelected();
            if (s == null) return;
            if (s.OpenTime) { UI.Warn(this, "รายการนี้เป็นแบบ \"เปิดเวลา\" (จ่ายตอนเลิก) ไม่ต้องเติมเวลา"); return; }
            TopUpForm f = new TopUpForm(s);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            s.PaidMinutes += f.Minutes;
            s.PrepaidAmount += f.Amount;
            ResetWarnings(s);
            Save();
            UpdateRows();
            Status("เติมเวลา " + s.Machine + " +" + Fmt.Minutes(f.Minutes) + " (" + Fmt.Money(f.Amount) + " บาท)", Color.DarkGreen);
        }

        void ResetWarnings(Session s)
        {
            double remain = s.RemainingSeconds();
            s.WarnedEnd = remain <= 0;
            s.WarnedSoon = remain <= st.Settings.WarnMinutes * 60.0;
        }

        void EditSelected()
        {
            Session s = RequireSelected();
            if (s == null) return;
            EditForm f = new EditForm(st, s);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            ResetWarnings(s);
            Save();
            RebuildList();
            Status("แก้ไขรายการ " + s.Machine + " เรียบร้อย", Color.DarkGreen);
        }

        void TogglePauseSelected()
        {
            Session s = RequireSelected();
            if (s == null) return;
            st.Tick(DateTime.Now, null, null);
            s.Paused = !s.Paused;
            s.LastTick = DateTime.Now;
            Save();
            UpdateRows();
            Status((s.Paused ? "หยุดเวลาชั่วคราว " : "เริ่มนับเวลาต่อ ") + s.Machine, Color.DarkBlue);
        }

        void CancelSelected()
        {
            Session s = RequireSelected();
            if (s == null) return;
            string msg = "ยกเลิกรายการเครื่อง " + s.Machine + " (" + s.MemberName + ") ?\n\n"
                + "รายการจะถูกบันทึกในประวัติว่า \"ยกเลิก\" และไม่นับเป็นรายรับ"
                + (s.PrepaidAmount > 0 ? "\n(อย่าลืมคืนเงิน " + Fmt.Money(s.PrepaidAmount) + " บาท ถ้ามี)" : "");
            if (!UI.Confirm(this, msg)) return;
            st.Tick(DateTime.Now, null, null);
            HistoryRecord r = HistoryRecord.FromSession(s, HistoryRecord.Cancelled, DateTime.Now, 0);
            r.Total = 0;
            try { store.AppendHistory(r); }
            catch (Exception ex) { store.Log("HISTORY " + ex); }
            st.Active.Remove(s);
            Save();
            RebuildList();
            Status("ยกเลิกรายการ " + s.Machine + " แล้ว", Color.DarkOrange);
        }

        // ---------------- ข้อมูลหลัก ----------------
        void EditUsageTypes()
        {
            List<string[]> rows = new List<string[]>();
            foreach (UsageType t in st.UsageTypes)
                rows.Add(new string[] { t.Id.ToString(), t.Name, Fmt.Money(t.RatePerHour) });
            GridEditForm f = new GridEditForm("รายการใช้งาน และ ราคาต่อชั่วโมง",
                "เพิ่มแถวใหม่ได้ที่แถวล่างสุด · ลบ: เลือกแถวแล้วกดปุ่มลบ · ราคาใหม่มีผลกับรายการที่เริ่มหลังจากนี้",
                new string[] { "ชื่อรายการใช้งาน", "ราคา (บาท/ชั่วโมง)" }, new int[] { 260, 150 }, rows,
                delegate(List<string[]> result)
                {
                    if (result.Count == 0) return "ต้องมีรายการใช้งานอย่างน้อย 1 รายการ";
                    foreach (string[] r in result)
                    {
                        decimal v;
                        if (r[1].Trim().Length == 0) return "กรุณาใส่ชื่อรายการใช้งาน";
                        if (!Fmt.TryMoney(r[2], out v) || v <= 0) return "ราคาของ \"" + r[1] + "\" ไม่ถูกต้อง";
                    }
                    return null;
                });
            if (f.ShowDialog(this) != DialogResult.OK) return;
            List<UsageType> list = new List<UsageType>();
            foreach (string[] r in f.Rows)
            {
                decimal rate;
                Fmt.TryMoney(r[2], out rate);
                int id;
                UsageType t = int.TryParse(r[0], out id) ? st.FindType(id) : null;
                if (t == null) { t = new UsageType(); t.Id = st.NextTypeId++; }
                t.Name = r[1].Trim();
                t.RatePerHour = rate;
                list.Add(t);
            }
            st.UsageTypes = list;
            Save();
            ApplySettings();
        }

        void EditMembers()
        {
            List<string[]> rows = new List<string[]>();
            foreach (Member m in st.Members)
                rows.Add(new string[] { m.Id.ToString(), m.Code, m.Name, m.Phone, Fmt.Money(m.DiscountPercent), m.Note });
            GridEditForm f = new GridEditForm("สมาชิก / ผู้ใช้งาน",
                "เพิ่มสมาชิกใหม่ได้ที่แถวล่างสุด · ส่วนลด % ใช้คิดเงินอัตโนมัติเมื่อเลือกสมาชิกตอนเพิ่มรายการ",
                new string[] { "รหัส", "ชื่อ", "เบอร์โทร", "ส่วนลด %", "หมายเหตุ" }, new int[] { 80, 200, 120, 80, 200 }, rows,
                delegate(List<string[]> result)
                {
                    List<string> codes = new List<string>();
                    foreach (string[] r in result)
                    {
                        decimal v;
                        if (r[2].Trim().Length == 0) return "กรุณาใส่ชื่อสมาชิกทุกแถว";
                        if (!Fmt.TryMoney(r[4], out v) || v > 100) return "ส่วนลดของ \"" + r[2] + "\" ต้องเป็น 0 - 100";
                        string code = r[1].Trim().ToUpperInvariant();
                        if (code.Length > 0 && codes.Contains(code)) return "รหัสสมาชิก \"" + r[1] + "\" ซ้ำกัน";
                        codes.Add(code);
                    }
                    return null;
                });
            if (f.ShowDialog(this) != DialogResult.OK) return;
            List<Member> list = new List<Member>();
            foreach (string[] r in f.Rows)
            {
                int id;
                Member m = int.TryParse(r[0], out id) ? st.FindMember(id) : null;
                if (m == null) { m = new Member(); m.Id = st.NextMemberId++; }
                m.Code = r[1].Trim();
                m.Name = r[2].Trim();
                m.Phone = r[3].Trim();
                decimal d;
                Fmt.TryMoney(r[4], out d);
                m.DiscountPercent = d;
                m.Note = r[5].Trim();
                list.Add(m);
            }
            st.Members = list;
            Save();
            ApplySettings();
        }

        void EditSettings()
        {
            SettingsForm f = new SettingsForm(st.Settings);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            foreach (Session s in st.Active) ResetWarnings(s);
            Save();
            ApplySettings();
            RebuildList();
        }

        void ShowHistory()
        {
            new HistoryForm(store).ShowDialog(this);
        }

        void ShowHelp()
        {
            MessageBox.Show(this,
                "เพิ่มรายการ (2-3 ขั้นตอน)\n"
                + "  1. เลือกเครื่อง (โปรแกรมเลือกเครื่องว่างให้อัตโนมัติ)\n"
                + "  2. ใส่จำนวนเงินที่ลูกค้าจ่าย (หรือกดปุ่มจำนวนเงินด่วน) → โปรแกรมคำนวณนาทีให้\n"
                + "  3. กด Enter เริ่มจับเวลา\n\n"
                + "ปิดรายการ: เลือกแถว → กด F9 (หรือดับเบิลคลิก) → Enter\n\n"
                + "สีในตาราง\n"
                + "  เหลือง = ใกล้หมดเวลา   แดง = หมดเวลา (มีเสียงเตือน)\n"
                + "  ฟ้า = เปิดเวลา จ่ายตอนเลิก   เทา = หยุดชั่วคราว\n\n"
                + "ปุ่มลัด: F3 เติมเวลา · F4 แก้ไข · F6 หยุด/ต่อ · F9 ชำระเงิน · F7 ประวัติ · F8 สมาชิก · Del ยกเลิก\n\n"
                + "ไฟดับ/เครื่องค้าง: ข้อมูลถูกบันทึกทุก 10 วินาที และทุกครั้งที่มีการเปลี่ยนแปลง\n"
                + "เปิดโปรแกรมใหม่ รายการที่ยังไม่ได้ชำระเงินจะกลับมาแสดงเหมือนเดิม\n\n"
                + "ที่เก็บข้อมูล: " + store.Dir,
                "วิธีใช้งาน", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
    }

    // ====================================================================
    // ชำระเงิน / ปิดรายการ
    // ====================================================================
    class PayForm : Form
    {
        public decimal Extra;
        readonly Session s;
        TextBox tbExtra, tbCash;
        Label lblTotal, lblDue, lblChange;

        public PayForm(Session s, int graceMinutes)
        {
            this.s = s;
            UI.Dialog(this, "ชำระเงิน / ปิดรายการ — " + s.Machine);
            TableLayoutPanel t = UI.Form2();
            double remain = s.RemainingSeconds();
            Extra = Pricing.ExtraDue(s, graceMinutes);

            UI.Row(t, "เครื่อง", Value(s.Machine, true));
            UI.Row(t, "ลูกค้า", Value(s.MemberName + (s.DiscountPercent > 0 ? "  (ลด " + Fmt.Money(s.DiscountPercent) + "%)" : ""), false));
            UI.Row(t, "รายการใช้งาน", Value(s.UsageName + "  " + Fmt.Money(s.RatePerHour) + " บาท/ชม.", false));
            UI.Row(t, "เวลาเริ่ม", Value(s.StartTime.ToString("dd/MM/yyyy HH:mm"), false));
            UI.Row(t, "เวลาที่ใช้", Value(Fmt.Duration(s.UsedSeconds) + "  (" + Fmt.Minutes(Pricing.UsedMinutes(s)) + ")", true));
            if (s.OpenTime)
                UI.Row(t, "แบบ", Value("เปิดเวลา (คิดเงินตามเวลาที่ใช้)", false));
            else
            {
                UI.Row(t, "เวลาที่ซื้อ", Value(Fmt.Minutes(s.PaidMinutes), false));
                UI.Row(t, remain >= 0 ? "เหลือเวลา" : "ใช้เกินเวลา", Value(Fmt.Duration(Math.Abs(remain)), remain < 0));
            }
            UI.Row(t, "จ่ายล่วงหน้าแล้ว", Value(Fmt.Money(s.PrepaidAmount) + " บาท", false));
            tbExtra = UI.Box(100);
            tbExtra.Text = Fmt.Money(Extra);
            UI.Row(t, s.OpenTime ? "ค่าบริการ (แก้ได้)" : "ค่าใช้เกินเวลา (แก้ได้)", tbExtra);
            lblTotal = Value("", true);
            lblTotal.Font = UI.Big;
            lblTotal.ForeColor = Color.DarkGreen;
            UI.Row(t, "ยอดรวมทั้งหมด", lblTotal);
            lblDue = Value("", true);
            lblDue.ForeColor = Color.Firebrick;
            UI.Row(t, "ต้องเก็บเงินเพิ่ม", lblDue);
            tbCash = UI.Box(100);
            UI.Row(t, "รับเงินมา", tbCash);
            lblChange = Value("", true);
            UI.Row(t, "เงินทอน", lblChange);

            UI.Finish(this, t, UI.OkCancel(this, "ชำระเงิน / ปิดรายการ (Enter)", delegate { Submit(); }));
            tbExtra.TextChanged += delegate { Recalc(); };
            tbCash.TextChanged += delegate { Recalc(); };
            Shown += delegate { tbCash.Focus(); };
            Recalc();
        }

        static Label Value(string text, bool bold)
        {
            Label l = UI.Lbl(text);
            if (bold) l.Font = UI.Bold;
            return l;
        }

        void Recalc()
        {
            decimal extra, cash;
            if (!Fmt.TryMoney(tbExtra.Text, out extra)) extra = 0;
            lblTotal.Text = Fmt.Money(s.PrepaidAmount + extra) + " บาท";
            lblDue.Text = Fmt.Money(extra) + " บาท";
            if (Fmt.TryMoney(tbCash.Text, out cash) && cash > 0)
                lblChange.Text = cash >= extra ? Fmt.Money(cash - extra) + " บาท" : "เงินไม่พอ (ขาด " + Fmt.Money(extra - cash) + ")";
            else
                lblChange.Text = "-";
        }

        void Submit()
        {
            if (!Fmt.TryMoney(tbExtra.Text, out Extra)) { UI.Warn(this, "จำนวนเงินไม่ถูกต้อง"); return; }
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // เติมเวลา
    // ====================================================================
    class TopUpForm : Form
    {
        public decimal Amount;
        public int Minutes;
        TextBox tbAmount, tbMinutes;
        bool syncing;

        public TopUpForm(Session s)
        {
            UI.Dialog(this, "เติมเวลา — " + s.Machine);

            TableLayoutPanel t = UI.Form2();
            tbAmount = UI.Box(100);
            tbMinutes = UI.Box(100);
            UI.Row(t, "เหลือเวลาตอนนี้", UI.Lbl(s.RemainingSeconds() >= 0 ? Fmt.Duration(s.RemainingSeconds()) : "เกิน " + Fmt.Duration(-s.RemainingSeconds())));
            UI.Row(t, "จ่ายเพิ่ม (บาท)", tbAmount);
            UI.Row(t, "ได้เวลาเพิ่ม (นาที)", tbMinutes);
            FlowLayoutPanel quick = UI.Flow();
            foreach (int v in new int[] { 10, 20, 30, 50, 100 })
            {
                int amount = v;
                quick.Controls.Add(UI.Btn(v.ToString(), delegate { tbAmount.Text = amount.ToString(); }));
            }
            UI.Row(t, "", quick);
            UI.Finish(this, t, UI.OkCancel(this, "เติมเวลา (Enter)", delegate { Submit(); }));

            tbAmount.TextChanged += delegate
            {
                decimal a;
                if (syncing || !Fmt.TryMoney(tbAmount.Text, out a)) return;
                syncing = true;
                tbMinutes.Text = a > 0 ? Pricing.MinutesFor(a, s.RatePerHour, s.DiscountPercent).ToString() : "";
                syncing = false;
            };
            tbMinutes.TextChanged += delegate
            {
                int m;
                if (syncing || !int.TryParse(tbMinutes.Text.Trim(), out m)) return;
                syncing = true;
                tbAmount.Text = m > 0 ? Fmt.Money(Pricing.AmountFor(m, s.RatePerHour, s.DiscountPercent)) : "";
                syncing = false;
            };
        }

        void Submit()
        {
            if (!Fmt.TryMoney(tbAmount.Text, out Amount)) { UI.Warn(this, "จำนวนเงินไม่ถูกต้อง"); return; }
            int.TryParse(tbMinutes.Text.Trim(), out Minutes);
            if (Minutes <= 0) { UI.Warn(this, "กรุณาใส่จำนวนเงิน หรือ จำนวนนาที"); return; }
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // แก้ไขรายการจับเวลา
    // ====================================================================
    class EditForm : Form
    {
        readonly AppState st;
        readonly Session s;
        ComboBox cbMachine, cbType, cbMember;
        CheckBox chkOpen;
        NumericUpDown nPaidMin, nPrepaid, nUsedMin;
        DateTimePicker dtStart;
        TextBox tbNote;

        public EditForm(AppState st, Session s)
        {
            this.st = st;
            this.s = s;
            UI.Dialog(this, "แก้ไขรายการ — " + s.Machine);

            TableLayoutPanel t = UI.Form2();
            cbMachine = new ComboBox();
            cbMachine.Width = 150;
            cbMachine.Items.AddRange(st.Settings.MachineList());
            cbMachine.Text = s.Machine;
            cbType = new ComboBox();
            cbType.DropDownStyle = ComboBoxStyle.DropDownList;
            cbType.Width = 280;
            Combos.Types(cbType, st, s.UsageTypeId);
            if (st.FindType(s.UsageTypeId) == null)
            {
                // ประเภทเดิมถูกลบไปแล้ว คงค่าเดิมไว้เป็นตัวเลือกแรก
                cbType.Items.Insert(0, new Item(null, s.UsageName + "  (" + Fmt.Money(s.RatePerHour) + " บาท/ชม.)"));
                cbType.SelectedIndex = 0;
            }
            cbMember = new ComboBox();
            cbMember.DropDownStyle = ComboBoxStyle.DropDownList;
            cbMember.Width = 280;
            Combos.Members(cbMember, st, s.MemberId);
            chkOpen = new CheckBox();
            chkOpen.Text = "เปิดเวลา (คิดเงินตอนเลิก)";
            chkOpen.AutoSize = true;
            chkOpen.Checked = s.OpenTime;
            dtStart = new DateTimePicker();
            dtStart.Format = DateTimePickerFormat.Custom;
            dtStart.CustomFormat = "dd/MM/yyyy HH:mm";
            dtStart.Width = 170;
            dtStart.Value = s.StartTime;
            nPaidMin = UI.Num(100000, 0);
            nPaidMin.Value = s.PaidMinutes;
            nPrepaid = UI.Num(1000000, 2);
            nPrepaid.Value = s.PrepaidAmount;
            nUsedMin = UI.Num(100000, 1);
            nUsedMin.Value = (decimal)Math.Round(s.UsedSeconds / 60.0, 1);
            tbNote = UI.Box(280);
            tbNote.Text = s.Note;

            FlowLayoutPanel paidRow = UI.Flow();
            paidRow.Controls.Add(nPaidMin);
            paidRow.Controls.Add(UI.Btn("คำนวณจากเงินที่จ่าย", delegate { CalcMinutes(); }));

            UI.Row(t, "เครื่อง", cbMachine);
            UI.Row(t, "รายการใช้งาน", cbType);
            UI.Row(t, "สมาชิก", cbMember);
            UI.Row(t, "", chkOpen);
            UI.Row(t, "เวลาเริ่ม", dtStart);
            UI.Row(t, "เงินที่จ่ายแล้ว (บาท)", nPrepaid);
            UI.Row(t, "เวลาที่ซื้อ (นาที)", paidRow);
            UI.Row(t, "เวลาที่ใช้ไปแล้ว (นาที)", nUsedMin);
            UI.Row(t, "หมายเหตุ", tbNote);
            UI.Finish(this, t, UI.OkCancel(this, "บันทึก (Enter)", delegate { Submit(); }));
        }

        void Rates(out decimal rate, out decimal discount)
        {
            UsageType t = Combos.SelectedType(cbType);
            Member m = Combos.SelectedMember(cbMember);
            rate = t != null ? t.RatePerHour : s.RatePerHour;
            discount = m != null ? m.DiscountPercent : 0;
        }

        void CalcMinutes()
        {
            decimal rate, discount;
            Rates(out rate, out discount);
            nPaidMin.Value = Math.Min(nPaidMin.Maximum, Pricing.MinutesFor(nPrepaid.Value, rate, discount));
        }

        void Submit()
        {
            string machine = cbMachine.Text.Trim();
            if (machine.Length == 0) { UI.Warn(this, "กรุณาใส่ชื่อเครื่อง"); return; }
            Session other = st.FindActiveOnMachine(machine);
            if (other != null && other != s) { UI.Warn(this, "เครื่อง " + machine + " มีรายการอื่นใช้งานอยู่"); return; }
            if (!chkOpen.Checked && nPaidMin.Value <= 0) { UI.Warn(this, "กรุณาใส่เวลาที่ซื้อ หรือ ติ๊ก \"เปิดเวลา\""); return; }

            s.Machine = machine;
            UsageType t = Combos.SelectedType(cbType);
            if (t != null)
            {
                s.UsageTypeId = t.Id;
                s.UsageName = t.Name;
                s.RatePerHour = t.RatePerHour;
            }
            Member m = Combos.SelectedMember(cbMember);
            s.MemberId = m != null ? m.Id : 0;
            s.MemberName = m != null ? m.Name : "ลูกค้าทั่วไป";
            s.DiscountPercent = m != null ? m.DiscountPercent : 0;
            s.OpenTime = chkOpen.Checked;
            s.StartTime = dtStart.Value;
            s.PrepaidAmount = nPrepaid.Value;
            s.PaidMinutes = (int)nPaidMin.Value;
            s.UsedSeconds = (double)nUsedMin.Value * 60.0;
            s.Note = tbNote.Text.Trim();
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // ตารางแก้ไขข้อมูลทั่วไป (รายการใช้งาน, สมาชิก)
    // ====================================================================
    class GridEditForm : Form
    {
        public delegate string Validator(List<string[]> rows);
        public List<string[]> Rows = new List<string[]>();
        readonly DataGridView grid;
        readonly Validator validate;
        readonly int cols;

        // แต่ละแถวมีคอลัมน์แรกเป็น Id (ซ่อนไว้) แถวใหม่ Id ว่าง
        public GridEditForm(string title, string help, string[] headers, int[] widths, List<string[]> rows, Validator validate)
        {
            this.validate = validate;
            cols = headers.Length + 1;
            Text = title;
            Font = UI.Base;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            MinimizeBox = false;
            int w = 80;
            foreach (int x in widths) w += x;
            Size = new Size(Math.Max(w, 520), 480);

            grid = new DataGridView();
            grid.Dock = DockStyle.Fill;
            grid.AllowUserToAddRows = true;
            grid.AllowUserToDeleteRows = true;
            grid.RowHeadersWidth = 30;
            grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            grid.Columns.Add("id", "id");
            grid.Columns[0].Visible = false;
            for (int i = 0; i < headers.Length; i++)
            {
                grid.Columns.Add("c" + i, headers[i]);
                grid.Columns[i + 1].Width = widths[i];
            }
            foreach (string[] r in rows) grid.Rows.Add(r);

            Label lblHelp = UI.Lbl(help);
            lblHelp.Dock = DockStyle.Top;
            lblHelp.ForeColor = Color.DimGray;
            lblHelp.Padding = new Padding(4);

            FlowLayoutPanel buttons = UI.OkCancel(this, "บันทึก", delegate { Submit(); });
            buttons.Dock = DockStyle.Bottom;
            Button del = UI.Btn("ลบแถวที่เลือก", delegate
            {
                foreach (DataGridViewRow r in grid.SelectedRows)
                    if (!r.IsNewRow) grid.Rows.Remove(r);
            });
            buttons.Controls.Add(del);
            AcceptButton = null; // Enter ใช้เลื่อนช่องในตาราง

            Controls.Add(grid);
            Controls.Add(lblHelp);
            Controls.Add(buttons);
        }

        void Submit()
        {
            grid.EndEdit();
            List<string[]> result = new List<string[]>();
            foreach (DataGridViewRow r in grid.Rows)
            {
                if (r.IsNewRow) continue;
                string[] values = new string[cols];
                bool empty = true;
                for (int i = 0; i < cols; i++)
                {
                    object v = r.Cells[i].Value;
                    values[i] = v == null ? "" : v.ToString();
                    if (i > 0 && values[i].Trim().Length > 0) empty = false;
                }
                if (!empty) result.Add(values);
            }
            string error = validate(result);
            if (error != null) { UI.Warn(this, error); return; }
            Rows = result;
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // ตั้งค่า
    // ====================================================================
    class SettingsForm : Form
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string RunName = "NetTimer";
        readonly Settings settings;
        TextBox tbShop, tbMachines;
        NumericUpDown nWarn, nGrace;
        CheckBox chkSound, chkAutoStart;

        public SettingsForm(Settings settings)
        {
            this.settings = settings;
            UI.Dialog(this, "ตั้งค่าร้าน และ รายชื่อเครื่อง");

            TableLayoutPanel t = UI.Form2();
            tbShop = UI.Box(300);
            tbShop.Text = settings.ShopName;
            tbMachines = UI.Box(300);
            tbMachines.Multiline = true;
            tbMachines.ScrollBars = ScrollBars.Vertical;
            tbMachines.Height = 160;
            tbMachines.Text = string.Join("\r\n", settings.MachineList());
            nWarn = UI.Num(120, 0);
            nWarn.Value = Math.Max(0, settings.WarnMinutes);
            nGrace = UI.Num(60, 0);
            nGrace.Value = Math.Max(0, settings.GraceMinutes);
            chkSound = new CheckBox();
            chkSound.Text = "เปิดเสียงแจ้งเตือน";
            chkSound.AutoSize = true;
            chkSound.Checked = settings.Sound;
            chkAutoStart = new CheckBox();
            chkAutoStart.Text = "เปิดโปรแกรมอัตโนมัติเมื่อเปิด Windows (แนะนำ กันไฟดับ)";
            chkAutoStart.AutoSize = true;
            chkAutoStart.Checked = IsAutoStart();

            UI.Row(t, "ชื่อร้าน", tbShop);
            UI.Row(t, "รายชื่อเครื่อง\n(บรรทัดละ 1 เครื่อง)", tbMachines);
            UI.Row(t, "เตือนก่อนหมดเวลา (นาที)", nWarn);
            UI.Row(t, "ใช้เกินไม่เกินกี่นาที ไม่คิดเงินเพิ่ม", nGrace);
            UI.Row(t, "", chkSound);
            UI.Row(t, "", chkAutoStart);
            FlowLayoutPanel buttons = UI.OkCancel(this, "บันทึก", delegate { Submit(); });
            AcceptButton = null; // Enter ใช้ขึ้นบรรทัดใหม่ในรายชื่อเครื่อง
            UI.Finish(this, t, buttons);
        }

        static bool IsAutoStart()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                    return k != null && k.GetValue(RunName) != null;
            }
            catch (Exception) { return false; }
        }

        static void SetAutoStart(bool on)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (on) k.SetValue(RunName, "\"" + Application.ExecutablePath + "\"");
                else if (k.GetValue(RunName) != null) k.DeleteValue(RunName);
            }
        }

        void Submit()
        {
            if (tbShop.Text.Trim().Length == 0) { UI.Warn(this, "กรุณาใส่ชื่อร้าน"); return; }
            settings.ShopName = tbShop.Text.Trim();
            settings.Machines = tbMachines.Text;
            settings.Machines = string.Join(",", settings.MachineList());
            settings.WarnMinutes = (int)nWarn.Value;
            settings.GraceMinutes = (int)nGrace.Value;
            settings.Sound = chkSound.Checked;
            if (chkAutoStart.Checked != IsAutoStart())
            {
                try { SetAutoStart(chkAutoStart.Checked); }
                catch (Exception ex) { UI.Warn(this, "ตั้งค่าเปิดอัตโนมัติไม่สำเร็จ: " + ex.Message); }
            }
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // ประวัติ / รายการที่บันทึก
    // ====================================================================
    class HistoryForm : Form
    {
        readonly Storage store;
        DateTimePicker dtFrom, dtTo;
        TextBox tbSearch;
        FastListView lv;
        Label lblSummary;
        List<HistoryRecord> shown = new List<HistoryRecord>();

        public HistoryForm(Storage store)
        {
            this.store = store;
            Text = "ประวัติ / รายการที่บันทึก";
            Font = UI.Base;
            KeyPreview = true;
            KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Escape) Close(); };
            Size = new Size(1150, 600);
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;

            FlowLayoutPanel top = UI.Flow();
            top.Dock = DockStyle.Top;
            top.WrapContents = true;
            top.Padding = new Padding(6);
            dtFrom = new DateTimePicker();
            dtFrom.Format = DateTimePickerFormat.Custom;
            dtFrom.CustomFormat = "dd/MM/yyyy";
            dtFrom.Width = 120;
            dtTo = new DateTimePicker();
            dtTo.Format = DateTimePickerFormat.Custom;
            dtTo.CustomFormat = "dd/MM/yyyy";
            dtTo.Width = 120;
            tbSearch = UI.Box(150);
            top.Controls.Add(UI.Lbl("ตั้งแต่"));
            top.Controls.Add(dtFrom);
            top.Controls.Add(UI.Lbl("ถึง"));
            top.Controls.Add(dtTo);
            top.Controls.Add(UI.Lbl("ค้นหา (เครื่อง/ชื่อ)"));
            top.Controls.Add(tbSearch);
            top.Controls.Add(UI.Btn("แสดง", delegate { LoadData(); }));
            top.Controls.Add(UI.Btn("วันนี้", delegate { dtFrom.Value = dtTo.Value = DateTime.Today; LoadData(); }));
            top.Controls.Add(UI.Btn("เดือนนี้", delegate
            {
                dtFrom.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
                dtTo.Value = DateTime.Today;
                LoadData();
            }));
            top.Controls.Add(UI.Btn("ส่งออกเป็นไฟล์ Excel (CSV)", delegate { Export(); }));
            tbSearch.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; LoadData(); } };

            lv = new FastListView();
            lv.Dock = DockStyle.Fill;
            lv.View = View.Details;
            lv.FullRowSelect = true;
            lv.GridLines = true;
            MainForm.AddColumns(lv,
                new string[] { "เลขที่", "ปิดรายการ", "เครื่อง", "ลูกค้า", "รายการใช้งาน", "เริ่ม", "ใช้ (นาที)", "ซื้อ (นาที)", "จ่ายก่อน", "เก็บเพิ่ม", "รวม", "สถานะ", "หมายเหตุ" },
                new int[] { 55, 130, 70, 140, 130, 60, 75, 75, 75, 70, 75, 75, 150 });

            lblSummary = UI.Lbl("");
            lblSummary.Dock = DockStyle.Bottom;
            lblSummary.Font = UI.Bold;
            lblSummary.Padding = new Padding(6);

            Controls.Add(lv);
            Controls.Add(lblSummary);
            Controls.Add(top);
            dtFrom.Value = dtTo.Value = DateTime.Today;
            Shown += delegate { LoadData(); };
        }

        void LoadData()
        {
            DateTime from = dtFrom.Value.Date, to = dtTo.Value.Date;
            if (to < from) { DateTime x = from; from = to; to = x; }
            string q = tbSearch.Text.Trim().ToLowerInvariant();
            shown.Clear();
            try
            {
                foreach (HistoryRecord r in store.LoadHistory(from, to))
                {
                    if (q.Length > 0 && (r.Machine + " " + r.MemberName + " " + r.UsageName + " " + r.Note).ToLowerInvariant().IndexOf(q) < 0) continue;
                    shown.Add(r);
                }
            }
            catch (Exception ex) { UI.Warn(this, "อ่านประวัติไม่สำเร็จ: " + ex.Message); }

            decimal total = 0;
            int minutes = 0, paid = 0, cancelled = 0;
            Dictionary<string, decimal> byType = new Dictionary<string, decimal>();
            lv.BeginUpdate();
            lv.Items.Clear();
            foreach (HistoryRecord r in shown)
            {
                ListViewItem it = new ListViewItem(new string[] {
                    r.Id.ToString(), r.EndTime.ToString("dd/MM/yyyy HH:mm"), r.Machine, r.MemberName, r.UsageName,
                    r.StartTime.ToString("HH:mm"), r.UsedMinutes.ToString(), r.PaidMinutes > 0 ? r.PaidMinutes.ToString() : "-",
                    Fmt.Money(r.Prepaid), Fmt.Money(r.Extra), Fmt.Money(r.Total), r.Status, r.Note });
                if (r.Status == HistoryRecord.Cancelled) { it.ForeColor = Color.Gray; cancelled++; }
                else
                {
                    paid++;
                    total += r.Total;
                    minutes += r.UsedMinutes;
                    decimal sum;
                    byType.TryGetValue(r.UsageName, out sum);
                    byType[r.UsageName] = sum + r.Total;
                }
                lv.Items.Add(it);
            }
            lv.EndUpdate();
            List<string> parts = new List<string>();
            foreach (KeyValuePair<string, decimal> kv in byType) parts.Add(kv.Key + " " + Fmt.Money(kv.Value));
            lblSummary.Text = "ชำระแล้ว " + paid + " รายการ  ·  ยกเลิก " + cancelled + "  ·  เวลาใช้งานรวม " + Fmt.Minutes(minutes)
                + "  ·  รายรับรวม " + Fmt.Money(total) + " บาท" + (parts.Count > 1 ? "   (" + string.Join(", ", parts.ToArray()) + ")" : "");
        }

        static string Csv(string v)
        {
            v = v ?? "";
            if (v.IndexOfAny(new char[] { ',', '"', '\n', '\r' }) >= 0) return "\"" + v.Replace("\"", "\"\"") + "\"";
            return v;
        }

        void Export()
        {
            if (shown.Count == 0) { UI.Warn(this, "ไม่มีรายการให้ส่งออก"); return; }
            SaveFileDialog d = new SaveFileDialog();
            d.Filter = "CSV (เปิดด้วย Excel)|*.csv";
            d.FileName = "netcafe-" + dtFrom.Value.ToString("yyyyMMdd", Fmt.Inv) + "-" + dtTo.Value.ToString("yyyyMMdd", Fmt.Inv) + ".csv";
            if (d.ShowDialog(this) != DialogResult.OK) return;
            StringBuilder sb = new StringBuilder();
            sb.Append("เลขที่,สถานะ,เริ่ม,ปิดรายการ,เครื่อง,ลูกค้า,รายการใช้งาน,ราคา/ชม.,ส่วนลด%,ใช้(นาที),ซื้อ(นาที),จ่ายก่อน,เก็บเพิ่ม,รวม,หมายเหตุ\r\n");
            foreach (HistoryRecord r in shown)
            {
                sb.Append(string.Join(",", new string[] {
                    r.Id.ToString(Fmt.Inv), Csv(r.Status), r.StartTime.ToString("yyyy-MM-dd HH:mm", Fmt.Inv), r.EndTime.ToString("yyyy-MM-dd HH:mm", Fmt.Inv),
                    Csv(r.Machine), Csv(r.MemberName), Csv(r.UsageName), r.RatePerHour.ToString(Fmt.Inv), r.DiscountPercent.ToString(Fmt.Inv),
                    r.UsedMinutes.ToString(Fmt.Inv), r.PaidMinutes.ToString(Fmt.Inv), r.Prepaid.ToString(Fmt.Inv), r.Extra.ToString(Fmt.Inv),
                    r.Total.ToString(Fmt.Inv), Csv(r.Note) }));
                sb.Append("\r\n");
            }
            try
            {
                File.WriteAllText(d.FileName, sb.ToString(), new UTF8Encoding(true));
                MessageBox.Show(this, "ส่งออกเรียบร้อย\n" + d.FileName, "ส่งออก", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex) { UI.Warn(this, "ส่งออกไม่สำเร็จ: " + ex.Message); }
        }
    }
}
