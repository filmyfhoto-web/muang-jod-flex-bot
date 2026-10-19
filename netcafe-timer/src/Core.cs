// NetTimer — โปรแกรมจับเวลาใช้อินเทอร์เน็ต (ชำระเงินก่อนใช้งาน)
// ส่วนแกน: ข้อมูล, การคิดเงิน, การบันทึกไฟล์แบบกันไฟดับ
// เขียนให้คอมไพล์ได้ด้วย csc.exe ที่ติดมากับ Windows (.NET Framework 4, C# 5)

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Xml.Serialization;

namespace NetTimer
{
    public class UsageType
    {
        public int Id;
        public string Name;
        public decimal RatePerHour;
    }

    public class Member
    {
        public int Id;
        public string Code;
        public string Name;
        public string Phone;
        public decimal DiscountPercent;
        public string Note;
    }

    // รายการที่กำลังจับเวลาอยู่ (ยังไม่ได้กดชำระเงิน)
    public class Session
    {
        public int Id;
        public string Machine;
        public int UsageTypeId;
        public string UsageName;
        public decimal RatePerHour;
        public int MemberId;
        public string MemberName;
        public decimal DiscountPercent;
        public DateTime StartTime;
        public DateTime LastTick;      // เวลาล่าสุดที่โปรแกรมนับให้ ใช้คำนวณช่วงที่โปรแกรมปิด/ไฟดับ
        public double UsedSeconds;
        public bool Paused;
        public bool OpenTime;          // เปิดเวลา คิดเงินตอนเลิก (ไม่ได้จ่ายล่วงหน้า)
        public int PaidMinutes;
        public decimal PrepaidAmount;
        public string Note;
        public bool WarnedSoon;
        public bool WarnedEnd;

        public double RemainingSeconds()
        {
            return PaidMinutes * 60.0 - UsedSeconds;
        }

        public bool IsTimeUp()
        {
            return !OpenTime && RemainingSeconds() <= 0;
        }
    }

    public class Settings
    {
        public string ShopName = "ร้านอินเทอร์เน็ต";
        public string Machines = "PC-01,PC-02,PC-03,PC-04,PC-05,PC-06,PC-07,PC-08,PC-09,PC-10";
        public int WarnMinutes = 5;
        public int GraceMinutes = 2;   // เกินเวลาไม่เกินกี่นาทีไม่คิดเงินเพิ่ม
        public bool Sound = true;

        public string[] MachineList()
        {
            List<string> list = new List<string>();
            foreach (string part in (Machines ?? "").Split(new char[] { ',', '\n', '\r' }))
            {
                string m = part.Trim();
                if (m.Length > 0 && !list.Contains(m)) list.Add(m);
            }
            return list.ToArray();
        }
    }

    public class AppState
    {
        public Settings Settings = new Settings();
        public List<UsageType> UsageTypes = new List<UsageType>();
        public List<Member> Members = new List<Member>();
        public List<Session> Active = new List<Session>();
        public int NextSessionId = 1;
        public int NextMemberId = 1;
        public int NextTypeId = 1;
        public DateTime SavedAt;

        // ค่าเริ่มต้นตอนเปิดโปรแกรมครั้งแรก (ห้ามใส่ใน constructor เพราะ XmlSerializer จะต่อรายการซ้ำ)
        public static AppState CreateDefault()
        {
            AppState s = new AppState();
            s.AddUsageType("อินเทอร์เน็ต", 20m);
            s.AddUsageType("เล่นเกม", 25m);
            s.AddUsageType("พิมพ์งาน/ทำรายงาน", 20m);
            return s;
        }

        public UsageType AddUsageType(string name, decimal rate)
        {
            UsageType t = new UsageType();
            t.Id = NextTypeId++;
            t.Name = name;
            t.RatePerHour = rate;
            UsageTypes.Add(t);
            return t;
        }

        public UsageType FindType(int id)
        {
            foreach (UsageType t in UsageTypes) if (t.Id == id) return t;
            return null;
        }

        public Member FindMember(int id)
        {
            foreach (Member m in Members) if (m.Id == id) return m;
            return null;
        }

        public Session FindSession(int id)
        {
            foreach (Session s in Active) if (s.Id == id) return s;
            return null;
        }

        public Session FindActiveOnMachine(string machine)
        {
            foreach (Session s in Active)
                if (string.Equals(s.Machine, machine, StringComparison.OrdinalIgnoreCase)) return s;
            return null;
        }

        // นับเวลาให้ทุกรายการที่ไม่ได้หยุดไว้ รายการที่เพิ่งใกล้หมด/หมดเวลาจะถูกใส่ใน soon/ended
        public void Tick(DateTime now, List<Session> soon, List<Session> ended)
        {
            foreach (Session s in Active)
            {
                if (!s.Paused)
                {
                    double delta = (now - s.LastTick).TotalSeconds;
                    if (delta > 0) s.UsedSeconds += delta;
                }
                s.LastTick = now;
                if (s.OpenTime) continue;
                double remain = s.RemainingSeconds();
                if (!s.WarnedSoon && remain > 0 && remain <= Settings.WarnMinutes * 60.0)
                {
                    s.WarnedSoon = true;
                    if (soon != null) soon.Add(s);
                }
                if (!s.WarnedEnd && remain <= 0)
                {
                    s.WarnedEnd = true;
                    s.WarnedSoon = true;
                    if (ended != null) ended.Add(s);
                }
            }
        }

        // ช่วงเวลาที่โปรแกรมไม่ได้ทำงาน (ปิด/ค้าง/ไฟดับ) นับจาก LastTick ของรายการที่ยังเดินอยู่
        public double OfflineSeconds(DateTime now)
        {
            double max = 0;
            foreach (Session s in Active)
            {
                if (s.Paused) continue;
                double gap = (now - s.LastTick).TotalSeconds;
                if (gap > max) max = gap;
            }
            return max;
        }

        // ตอนเปิดโปรแกรมใหม่: เลือกได้ว่าจะนับช่วงที่โปรแกรมปิดไปด้วยหรือไม่
        public void Resume(DateTime now, bool countOffline)
        {
            foreach (Session s in Active)
            {
                if (countOffline && !s.Paused)
                {
                    double gap = (now - s.LastTick).TotalSeconds;
                    if (gap > 0) s.UsedSeconds += gap;
                }
                s.LastTick = now;
            }
        }
    }

    public static class Pricing
    {
        public static decimal EffectiveRate(decimal ratePerHour, decimal discountPercent)
        {
            if (discountPercent < 0) discountPercent = 0;
            if (discountPercent > 100) discountPercent = 100;
            return ratePerHour * (100m - discountPercent) / 100m;
        }

        // จ่ายเงินเท่านี้ ได้กี่นาที (ปัดลง)
        public static int MinutesFor(decimal amount, decimal ratePerHour, decimal discountPercent)
        {
            decimal rate = EffectiveRate(ratePerHour, discountPercent);
            if (amount <= 0) return 0;
            if (rate <= 0) return 0;
            return (int)Math.Floor(amount * 60m / rate);
        }

        // ใช้กี่นาที ต้องจ่ายเท่าไหร่ (ปัดขึ้นเป็นบาท)
        public static decimal AmountFor(int minutes, decimal ratePerHour, decimal discountPercent)
        {
            if (minutes <= 0) return 0;
            decimal rate = EffectiveRate(ratePerHour, discountPercent);
            return Math.Ceiling(minutes * rate / 60m);
        }

        public static int UsedMinutes(Session s)
        {
            return (int)Math.Ceiling(s.UsedSeconds / 60.0 - 1e-9);
        }

        // ยอดที่ต้องเก็บเพิ่มตอนปิดรายการ
        public static decimal ExtraDue(Session s, int graceMinutes)
        {
            if (s.OpenTime)
            {
                decimal full = AmountFor(UsedMinutes(s), s.RatePerHour, s.DiscountPercent);
                return Math.Max(0, full - s.PrepaidAmount);
            }
            double over = -s.RemainingSeconds();
            if (over <= graceMinutes * 60.0) return 0;
            int overMin = (int)Math.Ceiling(over / 60.0 - 1e-9);
            return AmountFor(overMin, s.RatePerHour, s.DiscountPercent);
        }
    }

    public static class Fmt
    {
        public static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static string Duration(double seconds)
        {
            if (seconds < 0) seconds = 0;
            long t = (long)Math.Floor(seconds);
            return string.Format("{0}:{1:00}:{2:00}", t / 3600, (t / 60) % 60, t % 60);
        }

        public static string Minutes(int minutes)
        {
            if (minutes < 60) return minutes + " นาที";
            if (minutes % 60 == 0) return (minutes / 60) + " ชม.";
            return (minutes / 60) + " ชม. " + (minutes % 60) + " นาที";
        }

        public static string Money(decimal v)
        {
            return v.ToString("#,##0.##", Inv);
        }

        public static bool TryMoney(string text, out decimal v)
        {
            text = (text ?? "").Replace(",", "").Replace("บาท", "").Trim();
            if (text.Length == 0) { v = 0; return true; }
            return decimal.TryParse(text, NumberStyles.Number, Inv, out v) && v >= 0;
        }
    }

    // รายการที่ชำระเงินแล้ว/ยกเลิก บันทึกต่อท้ายไฟล์รายเดือน (history-YYYY-MM.txt)
    public class HistoryRecord
    {
        public const string Paid = "ชำระแล้ว";
        public const string Cancelled = "ยกเลิก";

        public int Id;
        public string Status;          // Paid / Cancelled
        public DateTime StartTime;
        public DateTime EndTime;
        public string Machine;
        public string UsageName;
        public string MemberName;
        public decimal RatePerHour;
        public decimal DiscountPercent;
        public int UsedMinutes;
        public int PaidMinutes;
        public decimal Prepaid;
        public decimal Extra;
        public decimal Total;
        public string Note;

        public const string Header = "Id\tStatus\tStart\tEnd\tMachine\tUsage\tMember\tRatePerHour\tDiscount\tUsedMinutes\tPaidMinutes\tPrepaid\tExtra\tTotal\tNote";
        const string DateFmt = "yyyy-MM-dd HH:mm:ss";

        static string Clean(string s)
        {
            return (s ?? "").Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
        }

        public string ToLine()
        {
            return string.Join("\t", new string[] {
                Id.ToString(Fmt.Inv), Clean(Status),
                StartTime.ToString(DateFmt, Fmt.Inv), EndTime.ToString(DateFmt, Fmt.Inv),
                Clean(Machine), Clean(UsageName), Clean(MemberName),
                RatePerHour.ToString(Fmt.Inv), DiscountPercent.ToString(Fmt.Inv),
                UsedMinutes.ToString(Fmt.Inv), PaidMinutes.ToString(Fmt.Inv),
                Prepaid.ToString(Fmt.Inv), Extra.ToString(Fmt.Inv), Total.ToString(Fmt.Inv),
                Clean(Note) });
        }

        public static HistoryRecord Parse(string line)
        {
            string[] f = line.Split('\t');
            if (f.Length < 14) return null;
            try
            {
                HistoryRecord r = new HistoryRecord();
                r.Id = int.Parse(f[0], Fmt.Inv);
                r.Status = f[1];
                r.StartTime = DateTime.ParseExact(f[2], DateFmt, Fmt.Inv);
                r.EndTime = DateTime.ParseExact(f[3], DateFmt, Fmt.Inv);
                r.Machine = f[4];
                r.UsageName = f[5];
                r.MemberName = f[6];
                r.RatePerHour = decimal.Parse(f[7], Fmt.Inv);
                r.DiscountPercent = decimal.Parse(f[8], Fmt.Inv);
                r.UsedMinutes = int.Parse(f[9], Fmt.Inv);
                r.PaidMinutes = int.Parse(f[10], Fmt.Inv);
                r.Prepaid = decimal.Parse(f[11], Fmt.Inv);
                r.Extra = decimal.Parse(f[12], Fmt.Inv);
                r.Total = decimal.Parse(f[13], Fmt.Inv);
                r.Note = f.Length > 14 ? f[14] : "";
                return r;
            }
            catch (FormatException) { return null; }
            catch (OverflowException) { return null; }
        }

        public static HistoryRecord FromSession(Session s, string status, DateTime end, decimal extra)
        {
            HistoryRecord r = new HistoryRecord();
            r.Id = s.Id;
            r.Status = status;
            r.StartTime = s.StartTime;
            r.EndTime = end;
            r.Machine = s.Machine;
            r.UsageName = s.UsageName;
            r.MemberName = s.MemberName;
            r.RatePerHour = s.RatePerHour;
            r.DiscountPercent = s.DiscountPercent;
            r.UsedMinutes = Pricing.UsedMinutes(s);
            r.PaidMinutes = s.PaidMinutes;
            r.Prepaid = s.PrepaidAmount;
            r.Extra = extra;
            r.Total = s.PrepaidAmount + extra;
            r.Note = s.Note;
            return r;
        }
    }

    // บันทึกไฟล์แบบปลอดภัย: เขียนไฟล์ชั่วคราวให้ลงดิสก์จริงก่อน แล้วค่อยสลับแทนไฟล์เดิม
    // ถ้าไฟดับกลางคัน ไฟล์เดิมหรือไฟล์สำรอง (.bak) ยังอยู่ครบเสมอ
    public class Storage
    {
        public readonly string Dir;
        readonly XmlSerializer serializer = new XmlSerializer(typeof(AppState));

        public Storage(string dir)
        {
            Dir = dir;
            Directory.CreateDirectory(dir);
        }

        public string StatePath { get { return Path.Combine(Dir, "state.xml"); } }

        public static string ChooseDataDir(string exeDir)
        {
            string local = Path.Combine(exeDir, "data");
            try
            {
                Directory.CreateDirectory(local);
                string probe = Path.Combine(local, ".write-test");
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
                return local;
            }
            catch (Exception)
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NetTimer");
            }
        }

        AppState TryRead(string path)
        {
            if (!File.Exists(path)) return null;
            try
            {
                using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (fs.Length == 0) return null;
                    return (AppState)serializer.Deserialize(fs);
                }
            }
            catch (Exception) { return null; }
        }

        // info บอกว่าโหลดจากไฟล์ไหน (ใช้แจ้งผู้ใช้เมื่อไฟล์หลักเสีย)
        public AppState Load(out string info)
        {
            info = null;
            string path = StatePath;
            AppState s = TryRead(path);
            if (s == null)
            {
                bool mainExists = File.Exists(path);
                s = TryRead(path + ".bak");
                if (s != null) info = "ไฟล์ข้อมูลหลักเสียหาย กู้คืนจากไฟล์สำรองแล้ว";
                if (s == null)
                {
                    s = TryRead(path + ".tmp");
                    if (s != null) info = "กู้คืนข้อมูลจากไฟล์ชั่วคราวแล้ว";
                }
                if (mainExists)
                {
                    try { File.Copy(path, path + ".broken-" + DateTime.Now.ToString("yyyyMMdd-HHmmss", Fmt.Inv), true); }
                    catch (Exception) { }
                }
                if (s == null)
                {
                    if (mainExists) info = "อ่านไฟล์ข้อมูลไม่ได้ เริ่มข้อมูลใหม่ (เก็บไฟล์เดิมไว้เป็น .broken)";
                    s = AppState.CreateDefault();
                }
            }
            if (s.Settings == null) s.Settings = new Settings();
            if (s.UsageTypes.Count == 0) s.AddUsageType("อินเทอร์เน็ต", 20m);
            return s;
        }

        public void Save(AppState s)
        {
            s.SavedAt = DateTime.Now;
            string path = StatePath;
            string tmp = path + ".tmp";
            string bak = path + ".bak";
            using (FileStream fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                StreamWriter w = new StreamWriter(fs, new UTF8Encoding(false));
                serializer.Serialize(w, s);
                w.Flush();
                fs.Flush(true);
            }
            if (!File.Exists(path))
            {
                File.Move(tmp, path);
                return;
            }
            try
            {
                File.Replace(tmp, path, bak, true);
            }
            catch (Exception)
            {
                // บางไดรฟ์ (FAT/USB) ไม่รองรับ Replace
                File.Copy(path, bak, true);
                File.Copy(tmp, path, true);
                File.Delete(tmp);
            }
        }

        string HistoryPath(DateTime month)
        {
            return Path.Combine(Dir, "history-" + month.ToString("yyyy-MM", Fmt.Inv) + ".txt");
        }

        public void AppendHistory(HistoryRecord r)
        {
            string path = HistoryPath(r.EndTime);
            bool isNew = !File.Exists(path) || new FileInfo(path).Length == 0;
            using (FileStream fs = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough))
            {
                StreamWriter w = new StreamWriter(fs, new UTF8Encoding(false));
                if (isNew) w.Write(HistoryRecord.Header + "\r\n");
                w.Write(r.ToLine() + "\r\n");
                w.Flush();
                fs.Flush(true);
            }
        }

        // อ่านประวัติช่วงวันที่ (รวมทั้งวัน from ถึงสิ้นวัน to) ตามเวลาที่ปิดรายการ
        // ถ้าเลขที่ซ้ำ (ไฟดับหลังบันทึกประวัติแต่ก่อนบันทึกสถานะ แล้วกดชำระซ้ำ) ใช้แถวล่าสุด
        public List<HistoryRecord> LoadHistory(DateTime from, DateTime to)
        {
            Dictionary<int, HistoryRecord> byId = new Dictionary<int, HistoryRecord>();
            DateTime start = from.Date;
            DateTime end = to.Date.AddDays(1);
            DateTime month = new DateTime(start.Year, start.Month, 1);
            while (month < end)
            {
                string path = HistoryPath(month);
                if (File.Exists(path))
                {
                    string[] lines;
                    using (FileStream fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                    using (StreamReader rd = new StreamReader(fs, Encoding.UTF8))
                        lines = rd.ReadToEnd().Split(new string[] { "\r\n", "\n" }, StringSplitOptions.RemoveEmptyEntries);
                    foreach (string line in lines)
                    {
                        if (line.StartsWith("Id\t")) continue;
                        HistoryRecord r = HistoryRecord.Parse(line);
                        if (r != null && r.EndTime >= start && r.EndTime < end) byId[r.Id] = r;
                    }
                }
                month = month.AddMonths(1);
            }
            List<HistoryRecord> list = new List<HistoryRecord>(byId.Values);
            list.Sort(delegate(HistoryRecord a, HistoryRecord b) { return a.EndTime.CompareTo(b.EndTime); });
            return list;
        }

        public void Log(string message)
        {
            try
            {
                File.AppendAllText(Path.Combine(Dir, "error.log"),
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss", Fmt.Inv) + "  " + message + "\r\n", Encoding.UTF8);
            }
            catch (Exception) { }
        }
    }
}
