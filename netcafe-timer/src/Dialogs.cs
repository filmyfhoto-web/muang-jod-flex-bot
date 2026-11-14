// NetTimer — หน้าต่างย่อยทั้งหมด

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

namespace NetTimer
{
    // ====================================================================
    // 1. เลือกผู้ใช้งาน / จัดการผู้ใช้
    // ====================================================================
    class MembersForm : Form
    {
        public Member Chosen;
        readonly MainForm main;
        readonly bool selectMode;
        readonly DataGridView grid;
        readonly TextBox tbSearch;

        public MembersForm(MainForm main, bool selectMode)
        {
            this.main = main;
            this.selectMode = selectMode;
            Text = selectMode ? "เลือกผู้ใช้งาน" : "จัดการผู้ใช้งาน";
            Font = Theme.Base;
            BackColor = Color.White;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            MinimizeBox = false;
            Size = selectMode ? new Size(700, 520) : new Size(860, 540);
            KeyPreview = true;

            tbSearch = Theme.Box(260);
            tbSearch.TextChanged += delegate { Fill(); };

            Panel top = new Panel();
            top.Dock = DockStyle.Top;
            top.Height = selectMode ? 84 : 62;
            top.Padding = new Padding(12, 10, 12, 6);
            FlowLayoutPanel topFlow = Theme.Flow();
            topFlow.Dock = DockStyle.Fill;
            if (selectMode)
            {
                topFlow.Controls.Add(new Avatar(60));
                FlowLayoutPanel search = Theme.Flow();
                search.FlowDirection = FlowDirection.TopDown;
                search.Controls.Add(Theme.Lbl("ค้นหาชื่อ รหัส หรือเบอร์โทร", Theme.F(10f), Theme.Muted));
                FlowLayoutPanel box = Theme.Flow();
                PictureBox icon = new PictureBox();
                icon.Image = Icons.Get("search", 22, Theme.Muted);
                icon.Size = new Size(26, 30);
                icon.SizeMode = PictureBoxSizeMode.CenterImage;
                box.Controls.Add(icon);
                tbSearch.Width = 420;
                box.Controls.Add(tbSearch);
                search.Controls.Add(box);
                topFlow.Controls.Add(search);
            }
            else
            {
                topFlow.Controls.Add(Theme.BtnGreen("เพิ่มผู้ใช้", "plus", delegate { Add(); }));
                topFlow.Controls.Add(Theme.BtnBlue("แก้ไข", "edit", delegate { Edit(); }));
                topFlow.Controls.Add(Theme.BtnRed("ลบ", "trash", delegate { Delete(); }));
                PictureBox icon = new PictureBox();
                icon.Image = Icons.Get("search", 22, Theme.Muted);
                icon.Size = new Size(40, 50);
                icon.SizeMode = PictureBoxSizeMode.CenterImage;
                topFlow.Controls.Add(icon);
                tbSearch.Margin = new Padding(0, 12, 0, 0);
                topFlow.Controls.Add(tbSearch);
            }
            top.Controls.Add(topFlow);

            Panel gridBox = new Panel();
            gridBox.Dock = DockStyle.Fill;
            gridBox.Padding = new Padding(12, 0, 12, 0);
            grid = Theme.Grid();
            grid.Dock = DockStyle.Fill;
            grid.BorderStyle = BorderStyle.FixedSingle;
            Theme.Col(grid, "รหัส", 90, true);
            Theme.FillCol(Theme.Col(grid, "ชื่อผู้ใช้", 200, false));
            Theme.Col(grid, "ประเภท", 110, true);
            if (selectMode) Theme.Col(grid, "สถานะ", 140, true);
            else
            {
                Theme.Col(grid, "เบอร์โทร", 140, true);
                Theme.Col(grid, "หมายเหตุ", 200, false);
            }
            grid.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e) { if (e.RowIndex >= 0) { if (selectMode) Choose(); else Edit(); } };
            grid.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Enter) { e.Handled = true; if (selectMode) Choose(); else Edit(); }
            };
            if (selectMode)
                grid.CellPainting += delegate(object s, DataGridViewCellPaintingEventArgs e)
                {
                    if (e.RowIndex >= 0 && e.ColumnIndex == 3) MainForm.PaintStatusCell(e);
                };
            gridBox.Controls.Add(grid);

            FlowLayoutPanel bottom = Theme.Flow();
            bottom.Dock = DockStyle.Bottom;
            bottom.Padding = new Padding(8, 6, 8, 8);
            if (selectMode)
            {
                Button choose = Theme.BtnBlue("เลือก", "check", delegate { Choose(); });
                choose.MinimumSize = new Size(130, 44);
                bottom.Controls.Add(choose);
                bottom.Controls.Add(Theme.BtnWhite("เพิ่มผู้ใช้ใหม่", "plus", delegate { Add(); }));
                bottom.Controls.Add(Theme.BtnWhite("แก้ไข", "edit", delegate { Edit(); }));
            }
            Button close = Theme.Btn("ปิด", "x", Color.White, Theme.Red, delegate { Close(); });
            close.ForeColor = Theme.Text;
            bottom.Controls.Add(close);
            CancelButton = close;

            Controls.Add(gridBox);
            Controls.Add(bottom);
            Controls.Add(top);
            Fill();
            Shown += delegate { tbSearch.Focus(); };
            tbSearch.KeyDown += delegate(object s, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Down) { grid.Focus(); e.Handled = true; }
                else if (e.KeyCode == Keys.Enter && selectMode) { e.SuppressKeyPress = true; Choose(); }
            };
        }

        void Fill()
        {
            Member sel = Current();
            string q = tbSearch.Text.Trim().ToLowerInvariant();
            grid.Rows.Clear();
            foreach (Member m in main.St.Members)
            {
                string hay = (m.Code + " " + m.Name + " " + m.Phone + " " + m.Note).ToLowerInvariant();
                if (q.Length > 0 && hay.IndexOf(q) < 0) continue;
                int row;
                if (selectMode)
                {
                    Session s = main.St.FindActiveForMember(m.Id);
                    row = grid.Rows.Add(m.Code, m.Name, m.Type, s == null ? "-" : main.StatusText(s));
                }
                else row = grid.Rows.Add(m.Code, m.Name, m.Type, m.Phone, m.Note);
                grid.Rows[row].Tag = m.Id;
                if (sel != null && sel.Id == m.Id) { grid.Rows[row].Selected = true; grid.CurrentCell = grid.Rows[row].Cells[0]; }
            }
        }

        Member Current()
        {
            if (grid == null || grid.SelectedRows.Count == 0) return null;
            return main.St.FindMember((int)grid.SelectedRows[0].Tag);
        }

        void Select(Member m)
        {
            foreach (DataGridViewRow r in grid.Rows)
                if ((int)r.Tag == m.Id) { r.Selected = true; grid.CurrentCell = r.Cells[0]; }
        }

        void Choose()
        {
            Member m = Current();
            if (m == null) { Theme.Warn(this, "กรุณาเลือกผู้ใช้งาน"); return; }
            Chosen = m;
            DialogResult = DialogResult.OK;
        }

        void Add()
        {
            MemberEditForm f = new MemberEditForm(main.St, null);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            main.Save();
            tbSearch.Text = "";
            Fill();
            Select(f.Result);
            grid.Focus();
        }

        void Edit()
        {
            Member m = Current();
            if (m == null) { Theme.Warn(this, "กรุณาเลือกผู้ใช้งาน"); return; }
            if (new MemberEditForm(main.St, m).ShowDialog(this) != DialogResult.OK) return;
            // อัปเดตชื่อในรายการที่กำลังใช้งานด้วย
            foreach (Session s in main.St.Active)
                if (s.MemberId == m.Id) { s.MemberCode = m.Code; s.MemberName = m.Name; s.MemberType = m.Type; }
            main.Save();
            Fill();
        }

        void Delete()
        {
            Member m = Current();
            if (m == null) { Theme.Warn(this, "กรุณาเลือกผู้ใช้งาน"); return; }
            if (main.St.FindActiveForMember(m.Id) != null) { Theme.Warn(this, m.Name + " มีรายการใช้งานอยู่ ลบไม่ได้"); return; }
            if (!Theme.Confirm(this, "ลบผู้ใช้ " + m.Code + " " + m.Name + " ?")) return;
            main.St.Members.Remove(m);
            main.Save();
            Fill();
        }
    }

    class MemberEditForm : Form
    {
        public Member Result;
        readonly AppState st;
        readonly Member member;
        readonly TextBox tbCode, tbName, tbPhone, tbNote;
        readonly ComboBox cbType;

        public MemberEditForm(AppState st, Member member)
        {
            this.st = st;
            this.member = member;
            Theme.Dialog(this, member == null ? "เพิ่มผู้ใช้ใหม่" : "แก้ไขผู้ใช้");
            TableLayoutPanel t = Theme.Form2();
            tbCode = Theme.Box(120);
            tbName = Theme.Box(260);
            tbPhone = Theme.Box(180);
            tbNote = Theme.Box(260);
            cbType = Theme.Combo(140);
            cbType.Items.Add(Member.TypeMember);
            cbType.Items.Add(Member.TypeGeneral);
            if (member != null)
            {
                tbCode.Text = member.Code;
                tbName.Text = member.Name;
                tbPhone.Text = member.Phone;
                tbNote.Text = member.Note;
                cbType.SelectedItem = member.Type == Member.TypeGeneral ? Member.TypeGeneral : Member.TypeMember;
            }
            else
            {
                tbCode.Text = st.NextMemberCode();
                cbType.SelectedIndex = 0;
            }
            Theme.Row(t, "รหัส", tbCode);
            Theme.Row(t, "ชื่อผู้ใช้", tbName);
            Theme.Row(t, "ประเภท", cbType);
            Theme.Row(t, "เบอร์โทร", tbPhone);
            Theme.Row(t, "หมายเหตุ", tbNote);
            Button ok = Theme.BtnBlue("บันทึก", "check", delegate { Submit(); });
            Button cancel = Theme.BtnWhite("ยกเลิก", null, null);
            cancel.DialogResult = DialogResult.Cancel;
            AcceptButton = ok;
            CancelButton = cancel;
            Theme.Stack(this, Theme.TitleBar(member == null ? "เพิ่มผู้ใช้ใหม่" : "แก้ไขผู้ใช้", "user", 440), t, Theme.Buttons(ok, cancel));
            Shown += delegate { tbName.Focus(); };
        }

        void Submit()
        {
            string code = tbCode.Text.Trim();
            string name = tbName.Text.Trim();
            if (name.Length == 0) { Theme.Warn(this, "กรุณาใส่ชื่อผู้ใช้"); tbName.Focus(); return; }
            if (code.Length == 0) { Theme.Warn(this, "กรุณาใส่รหัส"); tbCode.Focus(); return; }
            foreach (Member other in st.Members)
                if (other != member && string.Equals(other.Code, code, StringComparison.OrdinalIgnoreCase))
                {
                    Theme.Warn(this, "รหัส " + code + " มีผู้ใช้แล้ว (" + other.Name + ")");
                    tbCode.Focus();
                    return;
                }
            Member m = member;
            if (m == null)
            {
                m = new Member();
                m.Id = st.NextMemberId++;
                st.Members.Add(m);
            }
            m.Code = code;
            m.Name = name;
            m.Type = (string)cbType.SelectedItem;
            m.Phone = tbPhone.Text.Trim();
            m.Note = tbNote.Text.Trim();
            Result = m;
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // 2. เลือกเวลาและชำระเงิน (ใช้ทั้งตอนเริ่มใช้งานและตอนต่อเวลา)
    // ====================================================================
    class PackageForm : Form
    {
        public int Minutes;
        public decimal Price;
        readonly MainForm main;
        readonly Session s;
        readonly bool extend;
        readonly List<Button> tiles = new List<Button>();
        readonly Panel customTile;
        readonly NumericUpDown nHours;
        readonly Label lblTotal;
        bool customSelected;

        public PackageForm(MainForm main, Session s, bool extend)
        {
            this.main = main;
            this.s = s;
            this.extend = extend;
            AppState st = main.St;
            Theme.Dialog(this, extend ? "ต่อเวลาใช้งาน" : "กำหนดเวลาใช้งาน");
            KeyPreview = true;

            // ผู้ใช้
            FlowLayoutPanel who = Theme.Flow();
            who.Padding = new Padding(14, 12, 14, 4);
            who.Controls.Add(new Avatar(58));
            FlowLayoutPanel names = Theme.Flow();
            names.FlowDirection = FlowDirection.TopDown;
            names.Controls.Add(Theme.Lbl(s.MemberName + " (" + s.MemberCode + ")", Theme.B(14f), Theme.Text));
            names.Controls.Add(Theme.Lbl(extend ? "เวลาที่เหลือ " + Fmt.Clock(s.RemainingSeconds()) : "ประเภท: " + s.MemberType, Theme.F(10.5f), Theme.Muted));
            who.Controls.Add(names);

            // แพ็กเกจเวลา
            FlowLayoutPanel tileRow = Theme.Flow();
            tileRow.WrapContents = true;
            tileRow.MaximumSize = new Size(700, 0);
            tileRow.Padding = new Padding(12, 6, 12, 6);
            List<Package> packages = new List<Package>(st.Packages);
            packages.Sort(delegate(Package a, Package b) { return a.Minutes.CompareTo(b.Minutes); });
            foreach (Package p in packages)
            {
                Button b = new Button();
                b.Text = Fmt.Minutes(p.Minutes) + "\n" + Fmt.Money(p.Price) + " บาท";
                b.Tag = p;
                b.Size = new Size(116, 80);
                b.Font = Theme.B(11.5f);
                b.FlatStyle = FlatStyle.Flat;
                b.UseVisualStyleBackColor = false;
                b.Cursor = Cursors.Hand;
                b.Margin = new Padding(5);
                b.Click += delegate { Pick(b); };
                tiles.Add(b);
                tileRow.Controls.Add(b);
            }

            customTile = new Panel();
            customTile.Size = new Size(140, 80);
            customTile.Margin = new Padding(5);
            customTile.Padding = new Padding(2);
            customTile.Cursor = Cursors.Hand;
            Label lblCustom = Theme.Lbl("กำหนดเอง", Theme.B(10.5f), Theme.Text);
            lblCustom.Location = new Point(32, 4);
            nHours = Theme.Num(24, 1, 64);
            nHours.Minimum = 0.5m;
            nHours.Increment = 0.5m;
            nHours.Value = 1;
            nHours.Location = new Point(10, 36);
            Label lblHours = Theme.Lbl("ชั่วโมง", Theme.F(10f), Theme.Text);
            lblHours.Location = new Point(78, 40);
            customTile.Controls.Add(lblCustom);
            customTile.Controls.Add(nHours);
            customTile.Controls.Add(lblHours);
            customTile.Paint += delegate(object sender, PaintEventArgs e)
            {
                using (Pen pen = new Pen(customSelected ? Theme.Primary : Theme.Border, customSelected ? 2 : 1))
                    e.Graphics.DrawRectangle(pen, 0, 0, customTile.Width - 1, customTile.Height - 1);
            };
            EventHandler pickCustom = delegate { PickCustom(); };
            customTile.Click += pickCustom;
            lblCustom.Click += pickCustom;
            lblHours.Click += pickCustom;
            nHours.Enter += pickCustom;
            nHours.ValueChanged += pickCustom;
            tileRow.Controls.Add(customTile);

            // ยอดรวม
            FlowLayoutPanel totalRow = Theme.Flow();
            totalRow.Anchor = AnchorStyles.None;
            totalRow.Padding = new Padding(0, 6, 0, 6);
            totalRow.Controls.Add(Theme.Lbl("รวมเป็นเงิน", Theme.B(14f), Theme.Text));
            lblTotal = Theme.Lbl("0", Theme.B(24f), Theme.Text);
            lblTotal.Margin = new Padding(8, 0, 8, 0);
            totalRow.Controls.Add(lblTotal);
            totalRow.Controls.Add(Theme.Lbl("บาท", Theme.B(14f), Theme.Text));

            Button pay = Theme.BtnGreen(extend ? "ชำระเงินและต่อเวลา" : "ชำระเงินและเริ่มใช้งาน", "coins", delegate { Submit(); });
            pay.MinimumSize = new Size(230, 48);
            pay.Font = Theme.B(12f);
            Button back = Theme.BtnWhite("ย้อนกลับ", "back", null);
            back.MinimumSize = new Size(120, 48);
            back.DialogResult = DialogResult.Cancel;
            AcceptButton = pay;
            CancelButton = back;
            FlowLayoutPanel buttons = Theme.Buttons(pay, back);
            buttons.Anchor = AnchorStyles.None;

            Theme.Stack(this, Theme.TitleBar(extend ? "ต่อเวลาใช้งาน" : "เลือกเวลาและชำระเงิน", "clock", 700), who, tileRow, totalRow, buttons);

            // เลือกค่าเริ่มต้น: ค่าที่เลือกไว้ก่อนไฟดับ หรือ 1 ชั่วโมง
            Button initial = null;
            foreach (Button b in tiles)
            {
                Package p = (Package)b.Tag;
                if (s.Pending && s.PaidMinutes > 0 ? (p.Minutes == s.PaidMinutes && p.Price == s.PrepaidAmount) : p.Minutes == 60) initial = b;
            }
            if (initial == null && s.Pending && s.PaidMinutes > 0)
            {
                nHours.Value = Math.Max(nHours.Minimum, Math.Min(nHours.Maximum, Math.Round(s.PaidMinutes / 30m) / 2m));
                PickCustom();
            }
            else Pick(initial ?? (tiles.Count > 0 ? tiles[0] : null));
            Shown += delegate { pay.Focus(); };
            KeyDown += delegate(object sender, KeyEventArgs e)
            {
                int i = e.KeyCode - Keys.D1;
                if (i < 0 || i > 8) i = e.KeyCode - Keys.NumPad1;
                if (i >= 0 && i < tiles.Count && !nHours.Focused) { Pick(tiles[i]); e.Handled = true; }
            };
        }

        void Pick(Button chosen)
        {
            if (chosen == null) { PickCustom(); return; }
            customSelected = false;
            Package p = (Package)chosen.Tag;
            Set(p.Minutes, p.Price);
            Restyle(chosen);
        }

        void PickCustom()
        {
            customSelected = true;
            int minutes = (int)Math.Round(nHours.Value * 60);
            Set(minutes, Pricing.AmountFor(minutes, main.St.Settings.RatePerHour));
            Restyle(null);
        }

        void Restyle(Button chosen)
        {
            foreach (Button b in tiles)
            {
                bool on = b == chosen;
                b.BackColor = on ? Theme.LightBlue : Color.White;
                b.ForeColor = on ? Theme.PrimaryDark : Theme.Text;
                b.FlatAppearance.BorderColor = on ? Theme.Primary : Theme.Border;
                b.FlatAppearance.BorderSize = on ? 2 : 1;
            }
            customTile.BackColor = customSelected ? Theme.LightBlue : Color.White;
            customTile.Invalidate();
        }

        void Set(int minutes, decimal price)
        {
            Minutes = minutes;
            Price = price;
            lblTotal.Text = Fmt.Money(price);
            if (!extend) main.DraftChanged(s, minutes, price);
        }

        void Submit()
        {
            if (Minutes <= 0) { Theme.Warn(this, "กรุณาเลือกเวลา"); return; }
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // 3. กำลังใช้งาน (นับถอยหลัง)
    // ====================================================================
    class RunningForm : Form
    {
        readonly MainForm main;
        readonly Session s;
        readonly Label lblLeft, lblState, vStart, vEnd, vTotal, vPrice, lblName;
        readonly EventHandler tick;

        public RunningForm(MainForm main, Session s)
        {
            this.main = main;
            this.s = s;
            Theme.Dialog(this, "กำลังใช้งาน — " + s.MemberName);
            ShowInTaskbar = true;
            MinimizeBox = true;
            StartPosition = FormStartPosition.CenterScreen;

            // ซ้าย: ผู้ใช้ + เวลาที่เหลือ
            FlowLayoutPanel leftCol = Theme.Flow();
            leftCol.FlowDirection = FlowDirection.TopDown;
            leftCol.Padding = new Padding(14, 12, 10, 0);
            FlowLayoutPanel who = Theme.Flow();
            who.Controls.Add(new Avatar(54));
            FlowLayoutPanel names = Theme.Flow();
            names.FlowDirection = FlowDirection.TopDown;
            lblName = Theme.Lbl("", Theme.B(14f), Theme.Text);
            names.Controls.Add(lblName);
            names.Controls.Add(Theme.Lbl("ประเภท: " + s.MemberType, Theme.F(10f), Theme.Muted));
            who.Controls.Add(names);
            leftCol.Controls.Add(who);
            leftCol.Controls.Add(Theme.Lbl("เวลาที่เหลือ", Theme.B(13f), Theme.Text));
            lblLeft = Theme.Lbl("00:00:00", Theme.B(44f), Theme.Red);
            lblLeft.Margin = new Padding(0, 0, 0, 0);
            leftCol.Controls.Add(lblLeft);
            lblState = Theme.Lbl("", Theme.B(11f), Theme.Muted);
            leftCol.Controls.Add(lblState);

            // ขวา: รายละเอียด
            TableLayoutPanel info = new TableLayoutPanel();
            info.ColumnCount = 2;
            info.AutoSize = true;
            info.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            info.BackColor = Theme.LightBlue;
            info.Padding = new Padding(16, 12, 24, 12);
            info.Margin = new Padding(10, 18, 16, 6);
            vStart = Info(info, "เวลาเริ่ม");
            vEnd = Info(info, "เวลาสิ้นสุด");
            vTotal = Info(info, "รวมเวลา");
            vPrice = Info(info, "ค่าบริการ");

            TableLayoutPanel body = new TableLayoutPanel();
            body.ColumnCount = 2;
            body.AutoSize = true;
            body.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            body.Controls.Add(leftCol);
            body.Controls.Add(info);

            Button extendBtn = Theme.Btn("ต่อเวลา", "clock", Theme.Yellow, Theme.Text, delegate { main.Extend(s); Refresh_(); });
            Button stop = Theme.BtnRed("หยุดการใช้งาน", "stop", delegate { main.StopSession(s); Refresh_(); });
            Button detail = Theme.BtnWhite("รายละเอียด", "list", delegate { main.EditSession(s); Refresh_(); });
            foreach (Button b in new Button[] { extendBtn, stop, detail }) b.MinimumSize = new Size(150, 48);
            FlowLayoutPanel buttons = Theme.Buttons(extendBtn, stop, detail);
            buttons.Anchor = AnchorStyles.None;

            Theme.Stack(this, body, buttons);
            tick = delegate { Refresh_(); };
            main.Ticked += tick;
            FormClosed += delegate { main.Ticked -= tick; };
            Refresh_();
        }

        static Label Info(TableLayoutPanel t, string label)
        {
            Label l = Theme.Lbl(label, Theme.F(11f), Theme.Text);
            l.BackColor = Theme.LightBlue;
            Label v = Theme.Lbl("", Theme.B(11.5f), Theme.Text);
            v.BackColor = Theme.LightBlue;
            v.Margin = new Padding(18, 8, 3, 3);
            t.Controls.Add(l);
            t.Controls.Add(v);
            return v;
        }

        void Refresh_()
        {
            if (IsDisposed) return;
            if (main.St.FindSession(s.Id) == null) { Close(); return; }
            DateTime now = DateTime.Now;
            lblName.Text = s.MemberName + " (" + s.MemberCode + ")";
            Text = "กำลังใช้งาน — " + s.MemberName;
            lblLeft.Text = Fmt.Clock(s.RemainingSeconds());
            lblLeft.ForeColor = s.Paused ? Theme.Muted : Theme.Red;
            string state = main.StatusText(s);
            lblState.Text = state == "กำลังใช้งาน" ? "" : state;
            vStart.Text = s.StartTime.ToString("HH:mm");
            vEnd.Text = s.EndTime(now).ToString("HH:mm");
            vTotal.Text = Fmt.Minutes(s.PaidMinutes);
            vPrice.Text = Fmt.Money(s.PrepaidAmount) + " บาท";
        }
    }

    // ====================================================================
    // หยุดการใช้งาน (สรุปยอด + ค่าใช้เกินเวลา)
    // ====================================================================
    class StopForm : Form
    {
        public decimal Extra;
        readonly Session s;
        readonly TextBox tbExtra, tbCash;
        readonly Label lblTotal, lblChange;

        public StopForm(MainForm main, Session s)
        {
            this.s = s;
            Theme.Dialog(this, "หยุดการใช้งาน — " + s.MemberName);
            Extra = Pricing.ExtraDue(s, main.St.Settings.GraceMinutes);
            double remain = s.RemainingSeconds();
            TableLayoutPanel t = Theme.Form2();
            Theme.Row(t, "ผู้ใช้", Value(s.MemberName + " (" + s.MemberCode + ")", true));
            Theme.Row(t, "เวลาเริ่ม", Value(s.StartTime.ToString("dd/MM/yyyy HH:mm"), false));
            Theme.Row(t, "เวลาที่ใช้", Value(Fmt.Clock(s.UsedSeconds), true));
            Theme.Row(t, "เวลาที่ซื้อ", Value(Fmt.Minutes(s.PaidMinutes), false));
            Theme.Row(t, remain >= 0 ? "เวลาที่เหลือ" : "ใช้เกินเวลา", Value(Fmt.Clock(Math.Abs(remain)), remain < 0));
            Theme.Row(t, "ชำระแล้ว", Value(Fmt.Money(s.PrepaidAmount) + " บาท", false));
            tbExtra = Theme.Box(110);
            tbExtra.Text = Fmt.Money(Extra);
            Theme.Row(t, "ค่าใช้เกินเวลา (แก้ได้)", tbExtra);
            lblTotal = Theme.Lbl("", Theme.B(18f), Theme.Green);
            Theme.Row(t, "ยอดรวมทั้งหมด", lblTotal);
            tbCash = Theme.Box(110);
            Theme.Row(t, "รับเงินเพิ่ม", tbCash);
            lblChange = Value("-", true);
            Theme.Row(t, "เงินทอน", lblChange);

            Button stop = Theme.BtnRed("หยุดการใช้งาน", "stop", delegate { Submit(); });
            Button cancel = Theme.BtnWhite("ยกเลิก", null, null);
            cancel.DialogResult = DialogResult.Cancel;
            AcceptButton = stop;
            CancelButton = cancel;
            Theme.Stack(this, Theme.TitleBar("หยุดการใช้งาน", "stop", 460), t, Theme.Buttons(stop, cancel));
            tbExtra.TextChanged += delegate { Recalc(); };
            tbCash.TextChanged += delegate { Recalc(); };
            Recalc();
        }

        static Label Value(string text, bool bold)
        {
            return Theme.Lbl(text, bold ? Theme.Bold : Theme.Base, Theme.Text);
        }

        void Recalc()
        {
            decimal extra, cash;
            if (!Fmt.TryMoney(tbExtra.Text, out extra)) extra = 0;
            lblTotal.Text = Fmt.Money(s.PrepaidAmount + extra) + " บาท";
            if (Fmt.TryMoney(tbCash.Text, out cash) && cash > 0)
                lblChange.Text = cash >= extra ? Fmt.Money(cash - extra) + " บาท" : "เงินไม่พอ (ขาด " + Fmt.Money(extra - cash) + ")";
            else lblChange.Text = extra > 0 ? "ต้องเก็บเพิ่ม " + Fmt.Money(extra) + " บาท" : "-";
        }

        void Submit()
        {
            if (!Fmt.TryMoney(tbExtra.Text, out Extra)) { Theme.Warn(this, "จำนวนเงินไม่ถูกต้อง"); return; }
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // แก้ไขรายการจับเวลา
    // ====================================================================
    class EditForm : Form
    {
        const string StRunning = "กำลังใช้งาน", StPaused = "หยุดชั่วคราว", StPending = "รอชำระเงิน";
        readonly MainForm main;
        readonly Session s;
        readonly ComboBox cbUser, cbStatus;
        readonly DateTimePicker dtStart, dtEnd;
        readonly TextBox tbPrice, tbNote;
        readonly DateTime origStart, origEnd;

        static DateTime Minute(DateTime t) { return new DateTime(t.Year, t.Month, t.Day, t.Hour, t.Minute, 0); }

        public EditForm(MainForm main, Session s)
        {
            this.main = main;
            this.s = s;
            Theme.Dialog(this, "แก้ไขรายการ");
            DateTime now = DateTime.Now;
            origStart = Minute(s.Pending ? now : s.StartTime);
            origEnd = Minute(s.Pending ? origStart.AddMinutes(s.PaidMinutes) : s.EndTime(now));

            TableLayoutPanel t = Theme.Form2();
            cbUser = Theme.Combo(280);
            foreach (Member m in main.St.Members)
            {
                int i = cbUser.Items.Add(new Item(m, m.Code + " - " + m.Name));
                if (m.Id == s.MemberId) cbUser.SelectedIndex = i;
            }
            if (cbUser.SelectedIndex < 0)
            {
                // ผู้ใช้ถูกลบไปแล้ว คงชื่อเดิมไว้
                cbUser.Items.Insert(0, new Item(null, s.MemberCode + " - " + s.MemberName));
                cbUser.SelectedIndex = 0;
            }
            dtStart = Theme.DatePicker("dd/MM/yyyy  HH:mm", 190);
            dtStart.Value = origStart;
            dtEnd = Theme.DatePicker("dd/MM/yyyy  HH:mm", 190);
            dtEnd.Value = origEnd;
            tbPrice = Theme.Box(110);
            tbPrice.Text = Fmt.Money(s.PrepaidAmount);
            FlowLayoutPanel priceRow = Theme.Flow();
            priceRow.Controls.Add(tbPrice);
            priceRow.Controls.Add(Theme.Lbl("บาท"));
            cbStatus = Theme.Combo(190);
            cbStatus.Items.AddRange(new object[] { StRunning, StPaused, StPending });
            cbStatus.SelectedItem = s.Pending ? StPending : s.Paused ? StPaused : StRunning;
            tbNote = Theme.Box(280);
            tbNote.Text = s.Note;

            Theme.Row(t, "ผู้ใช้", cbUser);
            Theme.Row(t, "เวลาเริ่ม", dtStart);
            Theme.Row(t, "เวลาสิ้นสุด", dtEnd);
            Theme.Row(t, "ค่าบริการ", priceRow);
            Theme.Row(t, "สถานะ", cbStatus);
            Theme.Row(t, "หมายเหตุ", tbNote);

            Button ok = Theme.BtnBlue("บันทึก", "check", delegate { Submit(); });
            Button cancel = Theme.BtnWhite("ยกเลิก", null, null);
            cancel.DialogResult = DialogResult.Cancel;
            AcceptButton = ok;
            CancelButton = cancel;
            Theme.Stack(this, Theme.TitleBar("แก้ไขรายการจับเวลา", "edit", 460), t, Theme.Buttons(ok, cancel));
        }

        void Submit()
        {
            DateTime now = DateTime.Now;
            DateTime newStart = Minute(dtStart.Value), newEnd = Minute(dtEnd.Value);
            if (newEnd <= newStart) { Theme.Warn(this, "เวลาสิ้นสุดต้องหลังเวลาเริ่ม"); return; }
            decimal price;
            if (!Fmt.TryMoney(tbPrice.Text, out price)) { Theme.Warn(this, "ค่าบริการไม่ถูกต้อง"); return; }
            Item it = (Item)cbUser.SelectedItem;
            Member m = it.Value as Member;
            if (m != null && m.Id != s.MemberId && main.St.FindActiveForMember(m.Id) != null)
            {
                Theme.Warn(this, m.Name + " มีรายการใช้งานอยู่แล้ว");
                return;
            }

            if (m != null)
            {
                s.MemberId = m.Id;
                s.MemberCode = m.Code;
                s.MemberName = m.Name;
                s.MemberType = m.Type;
            }
            string status = (string)cbStatus.SelectedItem;
            int slot = (int)Math.Round((newEnd - newStart).TotalMinutes);
            if (status == StPending)
            {
                s.Pending = true;
                s.Paused = false;
                s.UsedSeconds = 0;
                s.PaidMinutes = slot;
                s.StartTime = newStart;
            }
            else if (s.Pending)
            {
                // เปลี่ยนจากรอชำระเงินเป็นกำลังใช้งาน: นับเวลาตั้งแต่เวลาเริ่มที่กรอก
                s.Pending = false;
                s.StartTime = newStart;
                s.UsedSeconds = Math.Max(0, (now - newStart).TotalSeconds);
                s.PaidMinutes = slot;
            }
            else
            {
                // เลื่อนเวลาเริ่ม = ใช้ไปมาก/น้อยขึ้น (เวลาสิ้นสุดคงเดิม) · เลื่อนเวลาสิ้นสุด = เพิ่ม/ลดเวลาที่ซื้อ
                double startShift = (origStart - newStart).TotalSeconds;
                double endShift = (newEnd - origEnd).TotalSeconds;
                s.StartTime = s.StartTime.AddSeconds(-startShift);
                s.UsedSeconds = Math.Max(0, s.UsedSeconds + startShift);
                s.PaidMinutes = Math.Max(0, s.PaidMinutes + (int)Math.Round((startShift + endShift) / 60.0));
            }
            s.Paused = status == StPaused;
            s.LastTick = now;
            s.PrepaidAmount = price;
            s.Note = tbNote.Text.Trim();
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // ตั้งค่าราคา / แพ็กเกจเวลา
    // ====================================================================
    class PriceForm : Form
    {
        readonly MainForm main;
        readonly DataGridView grid;
        readonly NumericUpDown nRate;

        public PriceForm(MainForm main)
        {
            this.main = main;
            Text = "ตั้งค่าราคา / แพ็กเกจเวลา";
            Font = Theme.Base;
            BackColor = Color.White;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            MinimizeBox = false;
            Size = new Size(560, 560);

            FlowLayoutPanel top = Theme.Flow();
            top.Dock = DockStyle.Top;
            top.Padding = new Padding(8, 8, 8, 4);
            top.Controls.Add(Theme.BtnGreen("เพิ่มรายการ", "plus", delegate { Add(); }));
            top.Controls.Add(Theme.BtnBlue("แก้ไข", "edit", delegate { Edit(); }));
            top.Controls.Add(Theme.BtnRed("ลบ", "trash", delegate { Delete(); }));

            Panel gridBox = new Panel();
            gridBox.Dock = DockStyle.Fill;
            gridBox.Padding = new Padding(14, 4, 14, 4);
            grid = Theme.Grid();
            grid.Dock = DockStyle.Fill;
            grid.BorderStyle = BorderStyle.FixedSingle;
            Theme.FillCol(Theme.Col(grid, "ระยะเวลา", 200, true));
            Theme.FillCol(Theme.Col(grid, "ราคา (บาท)", 200, true));
            grid.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e) { if (e.RowIndex >= 0) Edit(); };
            gridBox.Controls.Add(grid);

            FlowLayoutPanel bottom = Theme.Flow();
            bottom.Dock = DockStyle.Bottom;
            bottom.Padding = new Padding(10, 6, 10, 10);
            bottom.Controls.Add(Theme.Lbl("ราคาต่อชั่วโมง (กำหนดเอง / ใช้เกินเวลา)", Theme.Bold, Theme.Text));
            nRate = Theme.Num(100000, 2, 90);
            nRate.Value = main.St.Settings.RatePerHour;
            nRate.ValueChanged += delegate { main.St.Settings.RatePerHour = nRate.Value; main.Save(); };
            bottom.Controls.Add(nRate);
            bottom.Controls.Add(Theme.Lbl("บาท"));
            Button close = Theme.BtnWhite("ปิด", null, delegate { Close(); });
            CancelButton = close;
            bottom.Controls.Add(close);

            Controls.Add(gridBox);
            Controls.Add(bottom);
            Controls.Add(top);
            Fill(null);
        }

        void Fill(Package select)
        {
            main.St.Packages.Sort(delegate(Package a, Package b) { return a.Minutes.CompareTo(b.Minutes); });
            grid.Rows.Clear();
            foreach (Package p in main.St.Packages)
            {
                int r = grid.Rows.Add(Fmt.Minutes(p.Minutes), Fmt.Money(p.Price));
                grid.Rows[r].Tag = p;
                if (p == select) { grid.Rows[r].Selected = true; grid.CurrentCell = grid.Rows[r].Cells[0]; }
            }
        }

        Package Current()
        {
            return grid.SelectedRows.Count == 0 ? null : (Package)grid.SelectedRows[0].Tag;
        }

        bool Duplicate(Package except, int minutes)
        {
            foreach (Package p in main.St.Packages)
                if (p != except && p.Minutes == minutes) return true;
            return false;
        }

        void Add()
        {
            PackageEditForm f = new PackageEditForm(null);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            if (Duplicate(null, f.Minutes)) { Theme.Warn(this, "มีแพ็กเกจ " + Fmt.Minutes(f.Minutes) + " อยู่แล้ว"); return; }
            Package p = new Package();
            p.Minutes = f.Minutes;
            p.Price = f.Price;
            main.St.Packages.Add(p);
            main.Save();
            Fill(p);
        }

        void Edit()
        {
            Package p = Current();
            if (p == null) { Theme.Warn(this, "กรุณาเลือกรายการ"); return; }
            PackageEditForm f = new PackageEditForm(p);
            if (f.ShowDialog(this) != DialogResult.OK) return;
            if (Duplicate(p, f.Minutes)) { Theme.Warn(this, "มีแพ็กเกจ " + Fmt.Minutes(f.Minutes) + " อยู่แล้ว"); return; }
            p.Minutes = f.Minutes;
            p.Price = f.Price;
            main.Save();
            Fill(p);
        }

        void Delete()
        {
            Package p = Current();
            if (p == null) { Theme.Warn(this, "กรุณาเลือกรายการ"); return; }
            if (main.St.Packages.Count <= 1) { Theme.Warn(this, "ต้องมีแพ็กเกจอย่างน้อย 1 รายการ"); return; }
            if (!Theme.Confirm(this, "ลบแพ็กเกจ " + Fmt.Minutes(p.Minutes) + " " + Fmt.Money(p.Price) + " บาท ?")) return;
            main.St.Packages.Remove(p);
            main.Save();
            Fill(null);
        }
    }

    class PackageEditForm : Form
    {
        public int Minutes;
        public decimal Price;
        readonly NumericUpDown nAmount, nPrice;
        readonly ComboBox cbUnit;

        public PackageEditForm(Package p)
        {
            Theme.Dialog(this, p == null ? "เพิ่มแพ็กเกจเวลา" : "แก้ไขแพ็กเกจเวลา");
            TableLayoutPanel t = Theme.Form2();
            nAmount = Theme.Num(10000, 1, 90);
            cbUnit = Theme.Combo(110);
            cbUnit.Items.AddRange(new object[] { "นาที", "ชั่วโมง" });
            nPrice = Theme.Num(100000, 2, 110);
            if (p != null && p.Minutes % 60 == 0) { nAmount.Value = p.Minutes / 60; cbUnit.SelectedIndex = 1; }
            else if (p != null) { nAmount.Value = p.Minutes; cbUnit.SelectedIndex = 0; }
            else { nAmount.Value = 1; cbUnit.SelectedIndex = 1; }
            if (p != null) nPrice.Value = p.Price;
            FlowLayoutPanel dur = Theme.Flow();
            dur.Controls.Add(nAmount);
            dur.Controls.Add(cbUnit);
            FlowLayoutPanel price = Theme.Flow();
            price.Controls.Add(nPrice);
            price.Controls.Add(Theme.Lbl("บาท"));
            Theme.Row(t, "ระยะเวลา", dur);
            Theme.Row(t, "ราคา", price);
            Button ok = Theme.BtnBlue("บันทึก", "check", delegate { Submit(); });
            Button cancel = Theme.BtnWhite("ยกเลิก", null, null);
            cancel.DialogResult = DialogResult.Cancel;
            AcceptButton = ok;
            CancelButton = cancel;
            Theme.Stack(this, t, Theme.Buttons(ok, cancel));
        }

        void Submit()
        {
            Minutes = (int)Math.Round(nAmount.Value * (cbUnit.SelectedIndex == 1 ? 60 : 1));
            Price = nPrice.Value;
            if (Minutes <= 0) { Theme.Warn(this, "กรุณาใส่ระยะเวลา"); return; }
            if (Price <= 0) { Theme.Warn(this, "กรุณาใส่ราคา"); return; }
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
        readonly TextBox tbShop;
        readonly NumericUpDown nWarn, nGrace;
        readonly CheckBox chkSound, chkAutoStart;

        public SettingsForm(MainForm main)
        {
            settings = main.St.Settings;
            Theme.Dialog(this, "ตั้งค่า");
            TableLayoutPanel t = Theme.Form2();
            tbShop = Theme.Box(320);
            tbShop.Text = settings.ShopName;
            nWarn = Theme.Num(120, 0, 90);
            nWarn.Value = Math.Max(0, settings.WarnMinutes);
            nGrace = Theme.Num(60, 0, 90);
            nGrace.Value = Math.Max(0, settings.GraceMinutes);
            chkSound = new CheckBox();
            chkSound.Text = "เปิดเสียงแจ้งเตือน";
            chkSound.AutoSize = true;
            chkSound.Checked = settings.Sound;
            chkAutoStart = new CheckBox();
            chkAutoStart.Text = "เปิดโปรแกรมอัตโนมัติเมื่อเปิด Windows (แนะนำ กันไฟดับ)";
            chkAutoStart.AutoSize = true;
            chkAutoStart.Checked = IsAutoStart();
            Button folder = Theme.BtnWhite("เปิดโฟลเดอร์ข้อมูล", "report", delegate
            {
                try { Process.Start("explorer.exe", "\"" + main.Store.Dir + "\""); } catch (Exception) { }
            });

            Theme.Row(t, "ชื่อร้าน / หัวโปรแกรม", tbShop);
            Theme.Row(t, "เตือนก่อนหมดเวลา (นาที)", nWarn);
            Theme.Row(t, "ใช้เกินไม่เกินกี่นาที ไม่คิดเงินเพิ่ม", nGrace);
            Theme.Row(t, "", chkSound);
            Theme.Row(t, "", chkAutoStart);
            Theme.Row(t, "ข้อมูล", folder);

            Button ok = Theme.BtnBlue("บันทึก", "check", delegate { Submit(); });
            Button cancel = Theme.BtnWhite("ยกเลิก", null, null);
            cancel.DialogResult = DialogResult.Cancel;
            AcceptButton = ok;
            CancelButton = cancel;
            Theme.Stack(this, Theme.TitleBar("ตั้งค่า", "gear", 560), t, Theme.Buttons(ok, cancel));
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
            if (tbShop.Text.Trim().Length == 0) { Theme.Warn(this, "กรุณาใส่ชื่อร้าน"); return; }
            settings.ShopName = tbShop.Text.Trim();
            settings.WarnMinutes = (int)nWarn.Value;
            settings.GraceMinutes = (int)nGrace.Value;
            settings.Sound = chkSound.Checked;
            if (chkAutoStart.Checked != IsAutoStart())
            {
                try { SetAutoStart(chkAutoStart.Checked); }
                catch (Exception ex) { Theme.Warn(this, "ตั้งค่าเปิดอัตโนมัติไม่สำเร็จ: " + ex.Message); }
            }
            DialogResult = DialogResult.OK;
        }
    }

    // ====================================================================
    // รายงาน / ดูรายการที่บันทึกไว้
    // ====================================================================
    class ReportForm : Form
    {
        readonly Storage store;
        readonly DateTimePicker dtFrom, dtTo;
        readonly TextBox tbSearch;
        readonly DataGridView grid;
        readonly Label lblTotal, lblCount;
        readonly List<HistoryRecord> shown = new List<HistoryRecord>();

        public ReportForm(Storage store)
        {
            this.store = store;
            Text = "รายงาน — ประวัติการใช้งาน";
            Font = Theme.Base;
            BackColor = Color.White;
            Size = new Size(1120, 640);
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            MinimizeBox = false;
            KeyPreview = true;
            KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Escape) Close(); };

            Panel top = new Panel();
            top.Dock = DockStyle.Top;
            top.Height = 104;
            Label title = Theme.Lbl("ประวัติการใช้งาน", Theme.B(14f), Theme.Text);
            title.Location = new Point(14, 6);
            FlowLayoutPanel row = Theme.Flow();
            row.Location = new Point(10, 44);
            dtFrom = Theme.DatePicker("dd/MM/yyyy", 140);
            dtTo = Theme.DatePicker("dd/MM/yyyy", 140);
            tbSearch = Theme.Box(140);
            row.Controls.Add(Theme.Lbl("วันที่"));
            row.Controls.Add(dtFrom);
            row.Controls.Add(Theme.Lbl("ถึง"));
            row.Controls.Add(dtTo);
            row.Controls.Add(Theme.Lbl("ชื่อ/รหัส"));
            row.Controls.Add(tbSearch);
            row.Controls.Add(Theme.BtnBlue("ค้นหา", "search", delegate { LoadData(); }));
            row.Controls.Add(Theme.BtnWhite("วันนี้", null, delegate { dtFrom.Value = dtTo.Value = DateTime.Today; LoadData(); }));
            row.Controls.Add(Theme.BtnWhite("เดือนนี้", null, delegate
            {
                dtFrom.Value = new DateTime(DateTime.Today.Year, DateTime.Today.Month, 1);
                dtTo.Value = DateTime.Today;
                LoadData();
            }));
            row.Controls.Add(Theme.BtnGreen("ส่งออก Excel", "report", delegate { Export(); }));
            top.Controls.Add(title);
            top.Controls.Add(row);
            tbSearch.KeyDown += delegate(object s, KeyEventArgs e) { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; LoadData(); } };

            Panel gridBox = new Panel();
            gridBox.Dock = DockStyle.Fill;
            gridBox.Padding = new Padding(14, 0, 14, 0);
            grid = Theme.Grid();
            grid.Dock = DockStyle.Fill;
            grid.BorderStyle = BorderStyle.FixedSingle;
            Theme.Col(grid, "ลำดับ", 60, true);
            Theme.Col(grid, "วันที่", 110, true);
            Theme.Col(grid, "เวลาเริ่ม", 90, true);
            Theme.Col(grid, "เวลาสิ้นสุด", 90, true);
            Theme.Col(grid, "รหัส", 80, true);
            Theme.FillCol(Theme.Col(grid, "ชื่อผู้ใช้", 160, false));
            Theme.Col(grid, "ใช้ไป", 110, true);
            Theme.Col(grid, "ค่าบริการ", 100, true);
            Theme.Col(grid, "สถานะ", 110, true);
            grid.CellPainting += delegate(object s, DataGridViewCellPaintingEventArgs e)
            {
                if (e.RowIndex < 0 || e.ColumnIndex != 8) return;
                e.PaintBackground(e.CellBounds, (e.State & DataGridViewElementStates.Selected) != 0);
                bool cancelled = Convert.ToString(e.Value) == HistoryRecord.Cancelled;
                Theme.Pill(e.Graphics, e.CellBounds, Convert.ToString(e.Value),
                    cancelled ? Color.FromArgb(229, 231, 235) : Color.FromArgb(220, 245, 226),
                    cancelled ? Theme.Muted : Color.FromArgb(21, 128, 61), Theme.Bold);
                e.Handled = true;
            };
            gridBox.Controls.Add(grid);

            Panel bottom = new Panel();
            bottom.Dock = DockStyle.Bottom;
            bottom.Height = 62;
            Label lblSum = Theme.Lbl("รวมทั้งสิ้น", Theme.B(14f), Theme.Text);
            lblSum.Location = new Point(14, 16);
            lblCount = Theme.Lbl("", Theme.F(10.5f), Theme.Muted);
            lblCount.Location = new Point(140, 22);
            lblTotal = Theme.Lbl("0 บาท", Theme.B(20f), Theme.Primary);
            bottom.Controls.Add(lblSum);
            bottom.Controls.Add(lblCount);
            bottom.Controls.Add(lblTotal);
            bottom.Resize += delegate { lblTotal.Location = new Point(bottom.Width - lblTotal.Width - 20, 10); };
            lblTotal.SizeChanged += delegate { lblTotal.Location = new Point(bottom.Width - lblTotal.Width - 20, 10); };

            Controls.Add(gridBox);
            Controls.Add(bottom);
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
                    if (q.Length > 0 && (r.MemberCode + " " + r.MemberName + " " + r.Note).ToLowerInvariant().IndexOf(q) < 0) continue;
                    shown.Add(r);
                }
            }
            catch (Exception ex) { Theme.Warn(this, "อ่านประวัติไม่สำเร็จ: " + ex.Message); }

            decimal total = 0;
            int minutes = 0, done = 0, i = 0;
            grid.Rows.Clear();
            foreach (HistoryRecord r in shown)
            {
                int row = grid.Rows.Add((++i).ToString(), r.EndTime.ToString("dd/MM/yyyy"), r.StartTime.ToString("HH:mm"),
                    r.EndTime.ToString("HH:mm"), r.MemberCode, r.MemberName, Fmt.Minutes(r.UsedMinutes), Fmt.Money(r.Total), r.Status);
                if (r.Status == HistoryRecord.Cancelled) grid.Rows[row].DefaultCellStyle.ForeColor = Theme.Muted;
                else { done++; total += r.Total; minutes += r.UsedMinutes; }
            }
            lblTotal.Text = Fmt.Money(total) + " บาท";
            lblCount.Text = done + " รายการ · เวลาใช้งานรวม " + Fmt.Minutes(minutes);
        }

        static string Csv(string v)
        {
            v = v ?? "";
            if (v.IndexOfAny(new char[] { ',', '"', '\n', '\r' }) >= 0) return "\"" + v.Replace("\"", "\"\"") + "\"";
            return v;
        }

        void Export()
        {
            if (shown.Count == 0) { Theme.Warn(this, "ไม่มีรายการให้ส่งออก"); return; }
            SaveFileDialog d = new SaveFileDialog();
            d.Filter = "CSV (เปิดด้วย Excel)|*.csv";
            d.FileName = "netcafe-" + dtFrom.Value.ToString("yyyyMMdd", Fmt.Inv) + "-" + dtTo.Value.ToString("yyyyMMdd", Fmt.Inv) + ".csv";
            if (d.ShowDialog(this) != DialogResult.OK) return;
            StringBuilder sb = new StringBuilder();
            sb.Append("เลขที่,สถานะ,วันที่,เวลาเริ่ม,เวลาสิ้นสุด,รหัส,ชื่อผู้ใช้,ใช้(นาที),ซื้อ(นาที),ชำระก่อน,เก็บเพิ่ม,รวม,หมายเหตุ\r\n");
            foreach (HistoryRecord r in shown)
            {
                sb.Append(string.Join(",", new string[] {
                    r.Id.ToString(Fmt.Inv), Csv(r.Status), r.EndTime.ToString("yyyy-MM-dd", Fmt.Inv),
                    r.StartTime.ToString("HH:mm", Fmt.Inv), r.EndTime.ToString("HH:mm", Fmt.Inv),
                    Csv(r.MemberCode), Csv(r.MemberName), r.UsedMinutes.ToString(Fmt.Inv), r.PaidMinutes.ToString(Fmt.Inv),
                    r.Prepaid.ToString(Fmt.Inv), r.Extra.ToString(Fmt.Inv), r.Total.ToString(Fmt.Inv), Csv(r.Note) }));
                sb.Append("\r\n");
            }
            try
            {
                File.WriteAllText(d.FileName, sb.ToString(), new UTF8Encoding(true));
                MessageBox.Show(this, "ส่งออกเรียบร้อย\n" + d.FileName, "ส่งออก", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex) { Theme.Warn(this, "ส่งออกไม่สำเร็จ: " + ex.Message); }
        }
    }

    // ====================================================================
    // รายการค้างชำระ (แสดงตอนเปิดโปรแกรมหลังไฟดับ/เครื่องค้าง)
    // ====================================================================
    class RecoveryForm : Form
    {
        readonly MainForm main;
        readonly DataGridView grid;

        public RecoveryForm(MainForm main)
        {
            this.main = main;
            Text = "รองรับการป้องกันเครื่อง Hang / ไฟดับ";
            Font = Theme.Base;
            BackColor = Color.White;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            MinimizeBox = false;
            MaximizeBox = false;
            Size = new Size(760, 440);

            Panel banner = new Panel();
            banner.Dock = DockStyle.Top;
            banner.Height = 96;
            banner.BackColor = Color.FromArgb(255, 248, 225);
            banner.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                e.Graphics.DrawImage(Icons.Get("monitor", 60, Theme.Primary), 30, 18);
                TextRenderer.DrawText(e.Graphics, "เมื่อเปิดเครื่องใหม่\nรายการที่ยังไม่ได้ชำระเงิน\nจะยังแสดงอยู่ในระบบ", Theme.B(12f),
                    new Rectangle(120, 8, banner.Width - 130, banner.Height - 16), Theme.Red, TextFormatFlags.VerticalCenter);
            };

            Label title = Theme.Lbl("รายการค้างชำระ (ยังไม่ได้เริ่มใช้งาน)", Theme.B(12f), Theme.Primary);
            title.Dock = DockStyle.Top;
            title.Padding = new Padding(10, 8, 0, 4);

            Panel gridBox = new Panel();
            gridBox.Dock = DockStyle.Fill;
            gridBox.Padding = new Padding(12, 0, 12, 0);
            grid = Theme.Grid();
            grid.Dock = DockStyle.Fill;
            grid.BorderStyle = BorderStyle.FixedSingle;
            Theme.Col(grid, "ลำดับ", 60, true);
            Theme.Col(grid, "รหัสผู้ใช้", 100, true);
            Theme.FillCol(Theme.Col(grid, "ชื่อผู้ใช้", 160, false));
            Theme.Col(grid, "เวลา", 110, true);
            Theme.Col(grid, "ค่าบริการ", 100, true);
            Theme.Col(grid, "สถานะ", 130, true);
            grid.CellPainting += delegate(object s, DataGridViewCellPaintingEventArgs e)
            {
                if (e.RowIndex >= 0 && e.ColumnIndex == 5) MainForm.PaintStatusCell(e);
            };
            grid.CellDoubleClick += delegate(object s, DataGridViewCellEventArgs e) { if (e.RowIndex >= 0) Pay(); };
            gridBox.Controls.Add(grid);

            Button pay = Theme.BtnGreen("ชำระเงินและเริ่มใช้งาน", "coins", delegate { Pay(); });
            Button change = Theme.BtnWhite("เปลี่ยนเวลา", "clock", delegate { Change(); });
            Button cancel = Theme.BtnWhite("ยกเลิกรายการ", "trash", delegate { CancelItem(); });
            Button close = Theme.BtnWhite("ปิด", null, delegate { Close(); });
            CancelButton = close;
            FlowLayoutPanel bottom = Theme.Flow();
            bottom.Dock = DockStyle.Bottom;
            bottom.Padding = new Padding(8, 6, 8, 8);
            bottom.Controls.Add(pay);
            bottom.Controls.Add(change);
            bottom.Controls.Add(cancel);
            bottom.Controls.Add(close);

            Controls.Add(gridBox);
            Controls.Add(bottom);
            Controls.Add(title);
            Controls.Add(banner);
            Fill();
        }

        void Fill()
        {
            grid.Rows.Clear();
            int i = 0;
            foreach (Session s in main.St.Active)
            {
                if (!s.Pending) continue;
                int r = grid.Rows.Add((++i).ToString(), s.MemberCode, s.MemberName,
                    s.PaidMinutes > 0 ? Fmt.Minutes(s.PaidMinutes) : "-", Fmt.Money(s.PrepaidAmount), "รอชำระเงิน");
                grid.Rows[r].Tag = s.Id;
            }
            if (i == 0) Close();
        }

        Session Current()
        {
            if (grid.SelectedRows.Count == 0) { Theme.Warn(this, "กรุณาเลือกรายการ"); return null; }
            return main.St.FindSession((int)grid.SelectedRows[0].Tag);
        }

        void Pay()
        {
            Session s = Current();
            if (s == null) return;
            main.StartPendingAsIs(s);
            Fill();
        }

        void Change()
        {
            Session s = Current();
            if (s == null) return;
            main.PayPending(s);
            Fill();
        }

        void CancelItem()
        {
            Session s = Current();
            if (s == null) return;
            main.CancelSession(s);
            Fill();
        }
    }

    // ====================================================================
    // หน้าจอเตือนใกล้หมดเวลา / หมดเวลา
    // ====================================================================
    class WarnPopup : Form
    {
        static readonly Dictionary<int, WarnPopup> open = new Dictionary<int, WarnPopup>();
        readonly int sessionId;

        public static void ShowFor(MainForm main, Session s, bool ended)
        {
            CloseFor(s.Id);
            WarnPopup p = new WarnPopup(main, s, ended);
            open[s.Id] = p;
            Rectangle area = Screen.FromControl(main).WorkingArea;
            p.StartPosition = FormStartPosition.Manual;
            int slot = (open.Count - 1) % Math.Max(1, area.Height / (p.Height + 12));
            p.Location = new Point(area.Right - p.Width - 16 - 24 * ((open.Count - 1) / Math.Max(1, area.Height / (p.Height + 12))),
                area.Bottom - (p.Height + 12) * (slot + 1));
            p.Show(main);
        }

        public static void CloseFor(int id)
        {
            WarnPopup p;
            if (open.TryGetValue(id, out p)) { open.Remove(id); if (!p.IsDisposed) p.Close(); }
        }

        protected override bool ShowWithoutActivation { get { return true; } }

        WarnPopup(MainForm main, Session s, bool ended)
        {
            sessionId = s.Id;
            FormBorderStyle = FormBorderStyle.None;
            TopMost = true;
            ShowInTaskbar = false;
            BackColor = Color.White;
            Size = new Size(400, 250);
            Font = Theme.Base;

            Panel bar = new Panel();
            bar.Dock = DockStyle.Top;
            bar.Height = 40;
            bar.BackColor = Theme.Red;
            bar.Paint += delegate(object o, PaintEventArgs e)
            {
                e.Graphics.DrawImage(Icons.Get("bell", 22, Color.White), 12, 9);
                TextRenderer.DrawText(e.Graphics, "แจ้งเตือน", Theme.B(12f), new Point(42, 9), Color.White);
            };
            Button x = new Button();
            x.FlatStyle = FlatStyle.Flat;
            x.FlatAppearance.BorderSize = 0;
            x.BackColor = Theme.Red;
            x.Image = Icons.Get("x", 18, Color.White);
            x.Size = new Size(36, 36);
            x.Location = new Point(Width - 40, 2);
            x.Click += delegate { Close(); };
            bar.Controls.Add(x);

            Panel body = new Panel();
            body.Dock = DockStyle.Fill;
            body.Paint += delegate(object o, PaintEventArgs e)
            {
                Graphics g = e.Graphics;
                g.DrawImage(Icons.Get("warning", 76, Theme.Red), 28, 30);
                string line1 = ended ? "หมดเวลาใช้งานแล้ว" : "เหลือเวลาใช้งานอีก";
                string line2 = ended ? "0 นาที" : Math.Max(1, (int)Math.Ceiling(s.RemainingSeconds() / 60)) + " นาที";
                TextRenderer.DrawText(g, line1, Theme.B(14f), new Rectangle(120, 18, 270, 30), Theme.Red, TextFormatFlags.HorizontalCenter);
                TextRenderer.DrawText(g, line2, Theme.B(24f), new Rectangle(120, 48, 270, 44), Theme.Red, TextFormatFlags.HorizontalCenter);
                TextRenderer.DrawText(g, s.MemberName + " (" + s.MemberCode + ")", Theme.Bold, new Rectangle(120, 96, 270, 24), Theme.Text, TextFormatFlags.HorizontalCenter);
            };
            Button close = Theme.BtnRed("ปิด", null, delegate { Close(); });
            close.MinimumSize = new Size(110, 40);
            close.Location = new Point((Width - 110) / 2, 140);
            body.Controls.Add(close);
            if (ended)
            {
                Button ext = Theme.Btn("ต่อเวลา", "clock", Theme.Yellow, Theme.Text, delegate { Close(); main.Extend(s); });
                ext.MinimumSize = new Size(110, 40);
                ext.Location = new Point(Width / 2 - 120, 140);
                close.Location = new Point(Width / 2 + 10, 140);
                body.Controls.Add(ext);
            }

            Controls.Add(body);
            Controls.Add(bar);
            Paint += delegate(object o, PaintEventArgs e)
            {
                using (Pen pen = new Pen(Theme.Red, 2)) e.Graphics.DrawRectangle(pen, 1, 1, Width - 2, Height - 2);
            };
            Padding = new Padding(2);
            FormClosed += delegate
            {
                WarnPopup cur;
                if (open.TryGetValue(sessionId, out cur) && cur == this) open.Remove(sessionId);
            };
        }
    }
}
