// NetTimer — ธีม สี ฟอนต์ ไอคอน และตัวช่วยสร้างหน้าจอ

using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace NetTimer
{
    static class Theme
    {
        public static readonly Color Primary = Color.FromArgb(21, 101, 192);
        public static readonly Color PrimaryDark = Color.FromArgb(13, 59, 140);
        public static readonly Color Green = Color.FromArgb(40, 160, 70);
        public static readonly Color Yellow = Color.FromArgb(255, 193, 7);
        public static readonly Color Red = Color.FromArgb(220, 53, 69);
        public static readonly Color Back = Color.FromArgb(241, 245, 250);
        public static readonly Color Border = Color.FromArgb(213, 220, 229);
        public static readonly Color Text = Color.FromArgb(31, 41, 55);
        public static readonly Color Muted = Color.FromArgb(107, 114, 128);
        public static readonly Color LightBlue = Color.FromArgb(227, 240, 255);
        public static readonly Color HeaderRow = Color.FromArgb(238, 242, 247);

        static readonly string family = PickFamily();

        static string PickFamily()
        {
            foreach (string name in new string[] { "Leelawadee UI", "Leelawadee", "Tahoma" })
            {
                foreach (FontFamily f in FontFamily.Families)
                    if (string.Equals(f.Name, name, StringComparison.OrdinalIgnoreCase)) return f.Name;
            }
            return FontFamily.GenericSansSerif.Name;
        }

        public static Font F(float size) { return new Font(family, size); }
        public static Font B(float size) { return new Font(family, size, FontStyle.Bold); }

        public static readonly Font Base = F(10.5f);
        public static readonly Font Bold = B(10.5f);

        public static GraphicsPath Round(RectangleF r, float radius)
        {
            GraphicsPath p = new GraphicsPath();
            float d = Math.Min(radius * 2, Math.Min(r.Width, r.Height));
            if (d <= 0) { p.AddRectangle(r); return p; }
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        // ป้ายสถานะแบบเม็ดยา
        public static void Pill(Graphics g, Rectangle cell, string text, Color back, Color fore, Font font)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Size ts = TextRenderer.MeasureText(text, font);
            int w = Math.Min(cell.Width - 8, ts.Width + 18);
            int h = Math.Min(cell.Height - 8, ts.Height + 6);
            Rectangle r = new Rectangle(cell.X + (cell.Width - w) / 2, cell.Y + (cell.Height - h) / 2, w, h);
            using (GraphicsPath p = Round(r, h / 2f))
            using (SolidBrush b = new SolidBrush(back))
                g.FillPath(b, p);
            TextRenderer.DrawText(g, text, font, r, fore, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        }

        // ปุ่มในตาราง (วาดเอง)
        public static void CellButton(Graphics g, Rectangle cell, string text, Color back, Font font)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            Rectangle r = Rectangle.Inflate(cell, -10, -5);
            using (GraphicsPath p = Round(r, 4))
            using (SolidBrush b = new SolidBrush(back))
                g.FillPath(b, p);
            TextRenderer.DrawText(g, text, font, r, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }

        public static Button Btn(string text, string icon, Color back, Color fore, EventHandler click)
        {
            Button b = new Button();
            b.Text = text;
            b.Font = Bold;
            b.FlatStyle = FlatStyle.Flat;
            b.BackColor = back;
            b.ForeColor = fore;
            b.Cursor = Cursors.Hand;
            b.AutoSize = true;
            b.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            b.MinimumSize = new Size(100, 40);
            b.Padding = new Padding(10, 2, 12, 2);
            b.Margin = new Padding(6);
            b.UseVisualStyleBackColor = false;
            if (back == Color.White)
            {
                b.FlatAppearance.BorderColor = Border;
                b.FlatAppearance.BorderSize = 1;
            }
            else
            {
                b.FlatAppearance.BorderSize = 0;
            }
            if (icon != null)
            {
                b.Image = Icons.Get(icon, 20, fore);
                b.TextImageRelation = TextImageRelation.ImageBeforeText;
                b.ImageAlign = ContentAlignment.MiddleLeft;
            }
            if (click != null) b.Click += click;
            return b;
        }

        public static Button BtnBlue(string text, string icon, EventHandler click) { return Btn(text, icon, Primary, Color.White, click); }
        public static Button BtnGreen(string text, string icon, EventHandler click) { return Btn(text, icon, Green, Color.White, click); }
        public static Button BtnRed(string text, string icon, EventHandler click) { return Btn(text, icon, Red, Color.White, click); }
        public static Button BtnWhite(string text, string icon, EventHandler click) { return Btn(text, icon, Color.White, Text, click); }

        public static Label Lbl(string text)
        {
            Label l = new Label();
            l.Text = text;
            l.AutoSize = true;
            l.Anchor = AnchorStyles.Left;
            l.Margin = new Padding(3, 8, 8, 3);
            l.ForeColor = Text;
            return l;
        }

        public static Label Lbl(string text, Font font, Color color)
        {
            Label l = Lbl(text);
            l.Font = font;
            l.ForeColor = color;
            return l;
        }

        public static TextBox Box(int width)
        {
            TextBox t = new TextBox();
            t.Width = width;
            t.Font = F(11f);
            t.Margin = new Padding(3, 4, 3, 4);
            return t;
        }

        public static NumericUpDown Num(decimal max, int decimals, int width)
        {
            NumericUpDown n = new NumericUpDown();
            n.Maximum = max;
            n.DecimalPlaces = decimals;
            n.Width = width;
            n.Font = F(11f);
            n.ThousandsSeparator = true;
            n.Margin = new Padding(3, 4, 3, 4);
            return n;
        }

        public static DateTimePicker DatePicker(string format, int width)
        {
            DateTimePicker d = new DateTimePicker();
            d.Format = DateTimePickerFormat.Custom;
            d.CustomFormat = format;
            d.Width = width;
            d.Font = F(11f);
            d.Margin = new Padding(3, 4, 3, 4);
            return d;
        }

        public static ComboBox Combo(int width)
        {
            ComboBox c = new ComboBox();
            c.DropDownStyle = ComboBoxStyle.DropDownList;
            c.Width = width;
            c.Font = F(11f);
            c.Margin = new Padding(3, 4, 3, 4);
            return c;
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
            t.Padding = new Padding(16, 12, 16, 4);
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
            f.BackColor = Color.White;
            f.ForeColor = Text;
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false;
            f.MinimizeBox = false;
            f.ShowInTaskbar = false;
            f.StartPosition = FormStartPosition.CenterParent;
            f.AutoSize = true;
            f.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        }

        // วางส่วนต่าง ๆ เรียงลงมาในหน้าต่างที่ปรับขนาดตามเนื้อหา (ไม่ใช้ Dock เพราะ AutoSize ไม่นับขนาดตัวที่ Dock)
        public static TableLayoutPanel Stack(Form f, params Control[] parts)
        {
            TableLayoutPanel root = new TableLayoutPanel();
            root.ColumnCount = 1;
            root.AutoSize = true;
            root.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            root.Location = new Point(0, 0);
            root.Padding = new Padding(0, 0, 0, 8);
            foreach (Control c in parts) root.Controls.Add(c);
            f.Controls.Add(root);
            return root;
        }

        // แถวปุ่มชิดขวา
        public static FlowLayoutPanel Buttons(params Button[] buttons)
        {
            FlowLayoutPanel p = Flow();
            p.Anchor = AnchorStyles.Right;
            p.Padding = new Padding(10, 4, 10, 0);
            foreach (Button b in buttons) p.Controls.Add(b);
            return p;
        }

        public static void Warn(IWin32Window owner, string text)
        {
            MessageBox.Show(owner, text, "แจ้งเตือน", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        public static bool Confirm(IWin32Window owner, string text)
        {
            return MessageBox.Show(owner, text, "ยืนยัน", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;
        }

        public static DataGridView Grid()
        {
            DataGridView g = new FastGrid();
            g.BackgroundColor = Color.White;
            g.BorderStyle = BorderStyle.None;
            g.ReadOnly = true;
            g.AllowUserToAddRows = false;
            g.AllowUserToDeleteRows = false;
            g.AllowUserToResizeRows = false;
            g.MultiSelect = false;
            g.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
            g.RowHeadersVisible = false;
            g.CellBorderStyle = DataGridViewCellBorderStyle.SingleHorizontal;
            g.GridColor = Border;
            g.EnableHeadersVisualStyles = false;
            g.ColumnHeadersBorderStyle = DataGridViewHeaderBorderStyle.Single;
            g.ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing;
            g.ColumnHeadersHeight = 36;
            g.ColumnHeadersDefaultCellStyle.BackColor = HeaderRow;
            g.ColumnHeadersDefaultCellStyle.ForeColor = Text;
            g.ColumnHeadersDefaultCellStyle.Font = Bold;
            g.ColumnHeadersDefaultCellStyle.SelectionBackColor = HeaderRow;
            g.DefaultCellStyle.Font = F(11f);
            g.DefaultCellStyle.ForeColor = Text;
            g.DefaultCellStyle.SelectionBackColor = Color.FromArgb(220, 235, 255);
            g.DefaultCellStyle.SelectionForeColor = Text;
            g.DefaultCellStyle.Padding = new Padding(4, 0, 4, 0);
            g.RowTemplate.Height = 34;
            g.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None;
            return g;
        }

        public static DataGridViewColumn Col(DataGridView g, string header, int width, bool center)
        {
            DataGridViewTextBoxColumn c = new DataGridViewTextBoxColumn();
            c.HeaderText = header;
            c.Width = width;
            c.SortMode = DataGridViewColumnSortMode.NotSortable;
            if (center) c.DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleCenter;
            g.Columns.Add(c);
            return c;
        }

        public static void FillCol(DataGridViewColumn c)
        {
            c.AutoSizeMode = DataGridViewAutoSizeColumnMode.Fill;
            c.MinimumWidth = 120;
        }

        // แถบหัวข้อสีน้ำเงินด้านบนของหน้าต่าง
        public static Panel TitleBar(string text, string icon, int width)
        {
            Panel p = new Panel();
            p.Size = new Size(width, 48);
            p.Margin = new Padding(0);
            p.BackColor = Primary;
            p.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
                int x = 14;
                if (icon != null)
                {
                    e.Graphics.DrawImage(Icons.Get(icon, 26, Color.White), x, 11);
                    x += 36;
                }
                TextRenderer.DrawText(e.Graphics, text, B(14f), new Rectangle(x, 0, p.Width - x, p.Height), Color.White,
                    TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
            };
            return p;
        }
    }

    class FastGrid : DataGridView
    {
        public FastGrid() { DoubleBuffered = true; }
    }

    // รูปโปรไฟล์ (สี่เหลี่ยมมุมมนสีฟ้าอ่อน + ไอคอนคน)
    class Avatar : Control
    {
        public Avatar(int size)
        {
            Size = new Size(size, size);
            DoubleBuffered = true;
            Margin = new Padding(6);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            e.Graphics.Clear(Parent != null ? Parent.BackColor : Color.White);
            using (GraphicsPath p = Theme.Round(new RectangleF(0, 0, Width - 1, Height - 1), Width / 6f))
            using (SolidBrush b = new SolidBrush(Theme.LightBlue))
                e.Graphics.FillPath(b, p);
            int s = (int)(Width * 0.62);
            e.Graphics.DrawImage(Icons.Get("user", s, Theme.Primary), (Width - s) / 2, (Height - s) / 2 + 2);
        }
    }

    // ไอคอนวาดเองด้วย GDI+ (ไม่ต้องพึ่งไฟล์รูปหรือฟอนต์สัญลักษณ์)
    static class Icons
    {
        public static Bitmap Get(string kind, int s, Color c)
        {
            Bitmap bmp = new Bitmap(s, s);
            using (Graphics g = Graphics.FromImage(bmp))
            using (SolidBrush b = new SolidBrush(c))
            using (Pen pen = new Pen(c, Math.Max(2f, s / 11f)))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                pen.StartCap = pen.EndCap = LineCap.Round;
                pen.LineJoin = LineJoin.Round;
                Draw(g, kind, s, c, b, pen);
            }
            return bmp;
        }

        static float P(int s, double f) { return (float)(s * f); }

        static void User(Graphics g, Brush b, int s, float ox, float oy, float scale)
        {
            float k = s * scale;
            g.FillEllipse(b, ox + k * 0.30f, oy + k * 0.06f, k * 0.40f, k * 0.40f);
            g.SetClip(new RectangleF(ox, oy, k, k * 0.94f));
            g.FillEllipse(b, ox + k * 0.12f, oy + k * 0.52f, k * 0.76f, k * 0.70f);
            g.ResetClip();
        }

        static void Draw(Graphics g, string kind, int s, Color c, SolidBrush b, Pen pen)
        {
            switch (kind)
            {
                case "user":
                    User(g, b, s, 0, 0, 1f);
                    break;
                case "users":
                    using (SolidBrush light = new SolidBrush(Color.FromArgb(150, c)))
                        User(g, light, s, P(s, 0.32), P(s, 0.02), 0.68f);
                    User(g, b, s, 0, P(s, 0.18), 0.82f);
                    break;
                case "monitor":
                    using (GraphicsPath p = Theme.Round(new RectangleF(P(s, .06), P(s, .1), P(s, .88), P(s, .58)), s / 12f))
                        g.FillPath(b, p);
                    g.FillRectangle(Brushes.White, P(s, .14), P(s, .18), P(s, .72), P(s, .40));
                    g.FillRectangle(b, P(s, .43), P(s, .68), P(s, .14), P(s, .14));
                    g.FillRectangle(b, P(s, .26), P(s, .82), P(s, .48), P(s, .08));
                    break;
                case "coins":
                    for (int i = 2; i >= 0; i--)
                    {
                        float y = P(s, 0.56 - i * 0.2);
                        RectangleF top = new RectangleF(P(s, .14), y, P(s, .72), P(s, .22));
                        g.FillRectangle(b, top.X, y + top.Height / 2, top.Width, P(s, .14));
                        g.FillEllipse(b, top.X, y + P(s, .14), top.Width, top.Height);
                        g.FillEllipse(b, top);
                        using (Pen white = new Pen(Color.White, Math.Max(1f, s / 22f)))
                            g.DrawEllipse(white, top.X + 1, y + 1, top.Width - 2, top.Height - 2);
                    }
                    break;
                case "report":
                    g.FillPolygon(b, new PointF[] { new PointF(P(s, .18), P(s, .06)), new PointF(P(s, .62), P(s, .06)),
                        new PointF(P(s, .82), P(s, .26)), new PointF(P(s, .82), P(s, .94)), new PointF(P(s, .18), P(s, .94)) });
                    using (Pen white = new Pen(Color.White, Math.Max(1.5f, s / 14f)))
                        foreach (double y in new double[] { .40, .56, .72 })
                            g.DrawLine(white, P(s, .30), P(s, y), P(s, .70), P(s, y));
                    break;
                case "gear":
                    {
                        float cx = s / 2f, cy = s / 2f, r = P(s, .30);
                        for (int k = 0; k < 8; k++)
                        {
                            GraphicsState st = g.Save();
                            g.TranslateTransform(cx, cy);
                            g.RotateTransform(k * 45);
                            g.FillRectangle(b, -P(s, .08), -P(s, .46), P(s, .16), P(s, .2));
                            g.Restore(st);
                        }
                        g.FillEllipse(b, cx - r, cy - r, r * 2, r * 2);
                        float h = r * 0.45f;
                        g.FillEllipse(Brushes.White, cx - h, cy - h, h * 2, h * 2);
                    }
                    break;
                case "exit":
                    g.DrawLines(pen, new PointF[] { new PointF(P(s, .52), P(s, .26)), new PointF(P(s, .52), P(s, .12)),
                        new PointF(P(s, .12), P(s, .12)), new PointF(P(s, .12), P(s, .88)), new PointF(P(s, .52), P(s, .88)), new PointF(P(s, .52), P(s, .74)) });
                    g.DrawLine(pen, P(s, .34), P(s, .5), P(s, .88), P(s, .5));
                    g.DrawLine(pen, P(s, .70), P(s, .32), P(s, .88), P(s, .5));
                    g.DrawLine(pen, P(s, .70), P(s, .68), P(s, .88), P(s, .5));
                    break;
                case "clock":
                    g.DrawEllipse(pen, P(s, .1), P(s, .1), P(s, .8), P(s, .8));
                    g.DrawLine(pen, P(s, .5), P(s, .5), P(s, .5), P(s, .26));
                    g.DrawLine(pen, P(s, .5), P(s, .5), P(s, .68), P(s, .6));
                    break;
                case "stop":
                    using (GraphicsPath p = Theme.Round(new RectangleF(P(s, .2), P(s, .2), P(s, .6), P(s, .6)), s / 14f))
                        g.FillPath(b, p);
                    break;
                case "list":
                    foreach (double y in new double[] { .25, .5, .75 })
                    {
                        g.FillEllipse(b, P(s, .08), P(s, y - .07), P(s, .14), P(s, .14));
                        g.DrawLine(pen, P(s, .34), P(s, y), P(s, .9), P(s, y));
                    }
                    break;
                case "plus":
                    pen.Width = Math.Max(2.5f, s / 7f);
                    g.DrawLine(pen, P(s, .5), P(s, .18), P(s, .5), P(s, .82));
                    g.DrawLine(pen, P(s, .18), P(s, .5), P(s, .82), P(s, .5));
                    break;
                case "edit":
                    {
                        GraphicsState st = g.Save();
                        g.TranslateTransform(s / 2f, s / 2f);
                        g.RotateTransform(45);
                        g.FillRectangle(b, -P(s, .1), -P(s, .42), P(s, .2), P(s, .62));
                        g.FillPolygon(b, new PointF[] { new PointF(-P(s, .1), P(s, .24)), new PointF(P(s, .1), P(s, .24)), new PointF(0, P(s, .42)) });
                        g.Restore(st);
                    }
                    break;
                case "trash":
                    g.FillRectangle(b, P(s, .38), P(s, .08), P(s, .24), P(s, .1));
                    g.FillRectangle(b, P(s, .14), P(s, .18), P(s, .72), P(s, .1));
                    g.FillRectangle(b, P(s, .22), P(s, .32), P(s, .56), P(s, .6));
                    break;
                case "search":
                    g.DrawEllipse(pen, P(s, .12), P(s, .12), P(s, .52), P(s, .52));
                    pen.Width = Math.Max(2.5f, s / 8f);
                    g.DrawLine(pen, P(s, .58), P(s, .58), P(s, .88), P(s, .88));
                    break;
                case "warning":
                    using (GraphicsPath p = new GraphicsPath())
                    {
                        p.AddPolygon(new PointF[] { new PointF(P(s, .5), P(s, .06)), new PointF(P(s, .96), P(s, .9)), new PointF(P(s, .04), P(s, .9)) });
                        g.FillPath(b, p);
                    }
                    g.FillRectangle(Brushes.White, P(s, .45), P(s, .32), P(s, .1), P(s, .3));
                    g.FillEllipse(Brushes.White, P(s, .44), P(s, .68), P(s, .12), P(s, .12));
                    break;
                case "bell":
                    g.FillPie(b, P(s, .2), P(s, .14), P(s, .6), P(s, .7), 180, 180);
                    g.FillRectangle(b, P(s, .2), P(s, .48), P(s, .6), P(s, .22));
                    g.FillRectangle(b, P(s, .1), P(s, .68), P(s, .8), P(s, .08));
                    g.FillEllipse(b, P(s, .42), P(s, .78), P(s, .16), P(s, .14));
                    break;
                case "wifi":
                    pen.Width = Math.Max(2.5f, s / 9f);
                    foreach (double r in new double[] { .86, .58, .30 })
                    {
                        float d = P(s, r);
                        g.DrawArc(pen, s / 2f - d / 2, P(s, .82) - d / 2, d, d, 225, 90);
                    }
                    g.FillEllipse(b, P(s, .42), P(s, .74), P(s, .16), P(s, .16));
                    break;
                case "back":
                    pen.Width = Math.Max(2.5f, s / 8f);
                    g.DrawLines(pen, new PointF[] { new PointF(P(s, .62), P(s, .18)), new PointF(P(s, .32), P(s, .5)), new PointF(P(s, .62), P(s, .82)) });
                    break;
                case "x":
                    pen.Width = Math.Max(2.5f, s / 7f);
                    g.DrawLine(pen, P(s, .2), P(s, .2), P(s, .8), P(s, .8));
                    g.DrawLine(pen, P(s, .8), P(s, .2), P(s, .2), P(s, .8));
                    break;
                case "check":
                    pen.Width = Math.Max(2.5f, s / 7f);
                    g.DrawLines(pen, new PointF[] { new PointF(P(s, .16), P(s, .52)), new PointF(P(s, .4), P(s, .76)), new PointF(P(s, .86), P(s, .26)) });
                    break;
            }
        }
    }

    class Item
    {
        public readonly object Value;
        readonly string text;
        public Item(object value, string text) { Value = value; this.text = text; }
        public override string ToString() { return text; }
    }
}
