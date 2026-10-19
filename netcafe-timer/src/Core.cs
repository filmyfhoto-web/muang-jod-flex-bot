// NetTimer — โปรแกรมจับเวลาใช้อินเทอร์เน็ต (ชำระเงินก่อนใช้งาน)
// ส่วนแกน: ข้อมูล, การคิดเงิน, การนับเวลา, การบันทึกไฟล์แบบกันไฟดับ
// เขียนให้คอมไพล์ได้ด้วย csc.exe ที่ติดมากับ Windows (.NET Framework 4, C# 5)

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Xml.Serialization;

namespace NetTimer
{
    public class Member
    {
        public const string TypeMember = "สมาชิก";
        public const string TypeGeneral = "ทั่วไป";

        public int Id;
        public string Code;
        public string Name;
        public string Type = TypeGeneral;
        public string Phone;
        public string Note;
    }

    // แพ็กเกจเวลา เช่น 1 ชั่วโมง 20 บาท
    public class Package
    {
        public int Minutes;
        public decimal Price;
    }

    // รายการใช้งาน: สร้างตอนเลือกเวลา (รอชำระเงิน) → ชำระเงินแล้วเริ่มนับ → หยุดการใช้งานแล้วย้ายไปประวัติ
    public class Session
    {
        public int Id;
        public int MemberId;
        public string MemberCode;
        public string MemberName;
        public string MemberType;
        public bool Pending;           // ยังไม่ได้กดชำระเงิน (ไม่นับเวลา)
        public DateTime StartTime;
        public DateTime LastTick;      // เวลาล่าสุดที่นับให้ ใช้คำนวณช่วงที่โปรแกรมปิด/ไฟดับ
        public double UsedSeconds;
        public bool Paused;
        public int PaidMinutes;
        public decimal PrepaidAmount;
        public decimal RatePerHour;    // ใช้คิดค่าใช้เกินเวลา
        public string Note;
        public bool WarnedSoon;
        public bool WarnedEnd;

        public double RemainingSeconds()
        {
            return PaidMinutes * 60.0 - UsedSeconds;
        }

        public bool IsTimeUp()
        {
            return !Pending && RemainingSeconds() <= 0;
        }

        // เวลาสิ้นสุดโดยประมาณ (เลื่อนออกไปเองถ้าหยุดชั่วคราว)
        public DateTime EndTime(DateTime now)
        {
            if (Pending) return now.AddMinutes(PaidMinutes);
            return now.AddSeconds(RemainingSeconds());
        }
    }

    public class Settings
    {
        public string ShopName = "โปรแกรมจับเวลาใช้อินเทอร์เน็ต";
        public decimal RatePerHour = 20m;  // ราคาต่อชั่วโมง สำหรับ "กำหนดเอง" และคิดค่าใช้เกินเวลา
        public int WarnMinutes = 5;
        public int GraceMinutes = 2;       // ใช้เกินไม่เกินกี่นาทีไม่คิดเงินเพิ่ม
        public bool Sound = true;
    }

    public class AppState
    {
        public Settings Settings = new Settings();
        public List<Package> Packages = new List<Package>();
        public List<Member> Members = new List<Member>();
        public List<Session> Active = new List<Session>();
        public int NextSessionId = 1;
        public int NextMemberId = 1;
        public DateTime SavedAt;

        // ค่าเริ่มต้นตอนเปิดโปรแกรมครั้งแรก (ห้ามใส่ใน constructor เพราะ XmlSerializer จะต่อรายการซ้ำ)
        public static AppState CreateDefault()
        {
            AppState s = new AppState();
            s.SeedPackages();
            Member v = s.AddMember("Visitor", Member.TypeGeneral);
            v.Note = "ลูกค้าทั่วไป";
            return s;
        }

        public void SeedPackages()
        {
            int[] minutes = { 30, 60, 120, 180, 300 };
            decimal[] prices = { 10m, 20m, 40m, 60m, 100m };
            for (int i = 0; i < minutes.Length; i++)
            {
                Package p = new Package();
                p.Minutes = minutes[i];
                p.Price = prices[i];
                Packages.Add(p);
            }
        }

        public Member AddMember(string name, string type)
        {
            Member m = new Member();
            m.Id = NextMemberId++;
            m.Code = NextMemberCode();
            m.Name = name;
            m.Type = type;
            Members.Add(m);
            return m;
        }

        // รหัสถัดไปแบบ 0001, 0002, ...
        public string NextMemberCode()
        {
            int max = 0;
            foreach (Member m in Members)
            {
                int n;
                if (int.TryParse(m.Code, out n) && n > max) max = n;
            }
            return (max + 1).ToString("0000");
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

        public Session FindActiveForMember(int memberId)
        {
            foreach (Session s in Active) if (s.MemberId == memberId) return s;
            return null;
        }

        public Session NewSession(Member m, DateTime now)
        {
            Session s = new Session();
            s.Id = NextSessionId++;
            s.MemberId = m.Id;
            s.MemberCode = m.Code;
            s.MemberName = m.Name;
            s.MemberType = m.Type;
            s.Pending = true;
            s.StartTime = s.LastTick = now;
            s.RatePerHour = Settings.RatePerHour;
            s.Note = "";
            Active.Add(s);
            return s;
        }

        // ชำระเงินแล้ว เริ่มนับเวลาตั้งแต่ตอนนี้
        public void StartSession(Session s, DateTime now)
        {
            s.Pending = false;
            s.StartTime = s.LastTick = now;
            s.UsedSeconds = 0;
            ResetWarnings(s);
        }

        public void ResetWarnings(Session s)
        {
            double remain = s.RemainingSeconds();
            s.WarnedEnd = remain <= 0;
            s.WarnedSoon = remain <= Settings.WarnMinutes * 60.0;
        }

        // นับเวลาให้ทุกรายการที่เริ่มแล้วและไม่ได้หยุดไว้ รายการที่เพิ่งใกล้หมด/หมดเวลาจะถูกใส่ใน soon/ended
        public void Tick(DateTime now, List<Session> soon, List<Session> ended)
        {
            foreach (Session s in Active)
            {
                if (!s.Pending && !s.Paused)
                {
                    double delta = (now - s.LastTick).TotalSeconds;
                    if (delta > 0) s.UsedSeconds += delta;
                }
                s.LastTick = now;
                if (s.Pending) continue;
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

        // ช่วงเวลาที่โปรแกรมไม่ได้ทำงาน (ปิด/ค้าง/ไฟดับ) นับจาก LastTick ของรายการที่กำลังเดินอยู่
        public double OfflineSeconds(DateTime now)
        {
            double max = 0;
            foreach (Session s in Active)
            {
                if (s.Pending || s.Paused) continue;
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
                if (countOffline && !s.Pending && !s.Paused)
                {
                    double gap = (now - s.LastTick).TotalSeconds;
                    if (gap > 0) s.UsedSeconds += gap;
                }
                s.LastTick = now;
            }
        }

        public int PendingCount()
        {
            int n = 0;
            foreach (Session s in Active) if (s.Pending) n++;
            return n;
        }
    }

    public static class Pricing
    {
        // ใช้กี่นาที ต้องจ่ายเท่าไหร่ (ปัดขึ้นเป็นบาท)
        public static decimal AmountFor(int minutes, decimal ratePerHour)
        {
            if (minutes <= 0 || ratePerHour <= 0) return 0;
            return Math.Ceiling(minutes * ratePerHour / 60m);
        }

        public static int UsedMinutes(Session s)
        {
            return (int)Math.Ceiling(s.UsedSeconds / 60.0 - 1e-9);
        }

        // ค่าใช้เกินเวลา ตอนหยุดการใช้งาน
        public static decimal ExtraDue(Session s, int graceMinutes)
        {
            double over = -s.RemainingSeconds();
            if (s.Pending || over <= graceMinutes * 60.0) return 0;
            int overMin = (int)Math.Ceiling(over / 60.0 - 1e-9);
            return AmountFor(overMin, s.RatePerHour);
        }
    }

    public static class Fmt
    {
        public static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static string Clock(double seconds)
        {
            string sign = seconds < 0 ? "-" : "";
            long t = (long)Math.Floor(Math.Abs(seconds));
            return string.Format("{0}{1:00}:{2:00}:{3:00}", sign, t / 3600, (t / 60) % 60, t % 60);
        }

        public static string Minutes(int minutes)
        {
            if (minutes < 60) return minutes + " นาที";
            if (minutes % 60 == 0) return (minutes / 60) + " ชั่วโมง";
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

        // อ่านระยะเวลา เช่น "30", "30 นาที", "1 ชั่วโมง", "1.5 ชม."
        public static bool TryDuration(string text, out int minutes)
        {
            minutes = 0;
            string t = (text ?? "").Trim();
            bool hours = t.Contains("ชั่วโมง") || t.Contains("ชม");
            t = t.Replace("ชั่วโมง", "").Replace("ชม.", "").Replace("ชม", "").Replace("นาที", "").Trim();
            decimal v;
            if (!decimal.TryParse(t, NumberStyles.Number, Inv, out v) || v <= 0) return false;
            minutes = (int)Math.Round(hours ? v * 60m : v);
            return minutes > 0;
        }
    }

    // รายการที่หยุดใช้งาน/ยกเลิก บันทึกต่อท้ายไฟล์รายเดือน (history-YYYY-MM.txt)
    public class HistoryRecord
    {
        public const string Done = "เสร็จสิ้น";
        public const string Cancelled = "ยกเลิก";

        public int Id;
        public string Status;
        public DateTime StartTime;
        public DateTime EndTime;
        public string MemberCode;
        public string MemberName;
        public int UsedMinutes;
        public int PaidMinutes;
        public decimal Prepaid;
        public decimal Extra;
        public decimal Total;
        public string Note;

        public const string Header = "Id\tStatus\tStart\tEnd\tCode\tName\tUsedMinutes\tPaidMinutes\tPrepaid\tExtra\tTotal\tNote";
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
                Clean(MemberCode), Clean(MemberName),
                UsedMinutes.ToString(Fmt.Inv), PaidMinutes.ToString(Fmt.Inv),
                Prepaid.ToString(Fmt.Inv), Extra.ToString(Fmt.Inv), Total.ToString(Fmt.Inv),
                Clean(Note) });
        }

        public static HistoryRecord Parse(string line)
        {
            string[] f = line.Split('\t');
            if (f.Length < 11) return null;
            try
            {
                HistoryRecord r = new HistoryRecord();
                r.Id = int.Parse(f[0], Fmt.Inv);
                r.Status = f[1];
                r.StartTime = DateTime.ParseExact(f[2], DateFmt, Fmt.Inv);
                r.EndTime = DateTime.ParseExact(f[3], DateFmt, Fmt.Inv);
                r.MemberCode = f[4];
                r.MemberName = f[5];
                r.UsedMinutes = int.Parse(f[6], Fmt.Inv);
                r.PaidMinutes = int.Parse(f[7], Fmt.Inv);
                r.Prepaid = decimal.Parse(f[8], Fmt.Inv);
                r.Extra = decimal.Parse(f[9], Fmt.Inv);
                r.Total = decimal.Parse(f[10], Fmt.Inv);
                r.Note = f.Length > 11 ? f[11] : "";
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
            r.MemberCode = s.MemberCode;
            r.MemberName = s.MemberName;
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
            if (s.Packages.Count == 0) s.SeedPackages();
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

        // อ่านประวัติช่วงวันที่ (รวมทั้งวัน from ถึงสิ้นวัน to) ตามเวลาที่จบรายการ
        // ถ้าเลขที่ซ้ำ (ไฟดับหลังบันทึกประวัติแต่ก่อนบันทึกสถานะ แล้วกดหยุดซ้ำ) ใช้แถวล่าสุด
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
