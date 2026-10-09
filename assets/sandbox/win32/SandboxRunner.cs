using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

// Trusted host launcher. Only the Python child runs inside the LPAC.
// No network capabilities; isolated identity per run; explicit handle inheritance.
public static class SandboxRunner {
    [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public int length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO {
        public int cb; public string reserved, desktop, title; public int x,y,xSize,ySize,xChars,yChars,fill,flags;
        public short show, reserved2; public IntPtr reservedPtr, stdin, stdout, stderr;
    }
    [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO info; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public uint processId, threadId; }
    [StructLayout(LayoutKind.Sequential)] struct SECURITY_CAPABILITIES { public IntPtr sid, capabilities; public uint count, reserved; }
    [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr sid; public uint attributes; }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMITS {
        public long processTime, jobTime; public uint flags; public UIntPtr minWorkingSet, maxWorkingSet;
        public uint activeProcesses; public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMITS {
        public BASIC_LIMITS basic; public IO_COUNTERS io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob;
    }
    [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int CreateAppContainerProfile(string name, string display, string description, IntPtr caps, uint capCount, out IntPtr sid);
    [DllImport("userenv.dll", CharSet=CharSet.Unicode)] static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32.dll")] static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernelbase.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool DeriveCapabilitySidsFromName(string name, out IntPtr groups, out uint groupCount, out IntPtr capabilities, out uint capabilityCount);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateProcessW(string app, StringBuilder cmd, IntPtr processAttrs, IntPtr threadAttrs, bool inherit, uint flags, IntPtr env, string cwd, ref STARTUPINFOEX startup, out PROCESS_INFORMATION process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObjectW(IntPtr attrs, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint millis);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileW(string name, uint access, uint share, ref SECURITY_ATTRIBUTES attrs, uint creation, uint flags, IntPtr template);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string sddl, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetSecurityDescriptorSacl(IntPtr descriptor, out bool present, out IntPtr sacl, out bool defaulted);
    [DllImport("advapi32.dll", CharSet=CharSet.Unicode)] static extern uint SetNamedSecurityInfoW(string name, int type, uint info, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr pointer);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr info, int size, out int returned);

    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static IntPtr Allocate<T>(T value) { IntPtr p = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(T))); Marshal.StructureToPtr(value, p, false); return p; }
    static void Attribute(IntPtr list, long id, IntPtr value, int size) { Check(UpdateProcThreadAttribute(list, 0, new IntPtr(id), value, new IntPtr(size), IntPtr.Zero, IntPtr.Zero)); }
    static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
    static void Grant(string folder, SecurityIdentifier sid, FileSystemRights rights, bool inherit, bool remove) {
        using (Mutex mutex = new Mutex(false, "Local\\PaperPetSandboxAclV1")) {
            try { mutex.WaitOne(); } catch (AbandonedMutexException) { }
            try {
                DirectorySecurity acl = Directory.GetAccessControl(folder);
                FileSystemAccessRule rule = new FileSystemAccessRule(sid, rights, inherit ? InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit : InheritanceFlags.None, PropagationFlags.None, AccessControlType.Allow);
                if (remove) acl.RemoveAccessRuleSpecific(rule); else acl.AddAccessRule(rule);
                Directory.SetAccessControl(folder, acl);
            } finally { mutex.ReleaseMutex(); }
        }
    }
    static void LowIntegrity(string folder) {
        IntPtr descriptor = IntPtr.Zero;
        try {
            uint size; Check(ConvertStringSecurityDescriptorToSecurityDescriptorW("S:(ML;OICI;NW;;;LW)", 1, out descriptor, out size));
            bool present, defaulted; IntPtr sacl;
            Check(GetSecurityDescriptorSacl(descriptor, out present, out sacl, out defaulted));
            uint code = SetNamedSecurityInfoW(folder, 1, 0x10, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, sacl);
            if (code != 0) throw new Win32Exception((int)code);
        } finally { if (descriptor != IntPtr.Zero) LocalFree(descriptor); }
    }
    static long TreeSize(string root) {
        long size = 0;
        foreach (string file in Directory.GetFiles(root)) { if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) == 0) size += new FileInfo(file).Length; }
        foreach (string dir in Directory.GetDirectories(root)) { if ((File.GetAttributes(dir) & FileAttributes.ReparsePoint) == 0) size += TreeSize(dir); }
        return size;
    }
    static string ReadBounded(string file) {
        using (FileStream stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
            byte[] bytes = new byte[(int)Math.Min(stream.Length, 1024 * 1024)];
            int count = stream.Read(bytes, 0, bytes.Length);
            return Encoding.UTF8.GetString(bytes, 0, count);
        }
    }
    public static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        JavaScriptSerializer json = new JavaScriptSerializer(); json.MaxJsonLength = 8 * 1024 * 1024;
        if (args.Length == 1 && args[0] == "--probe") { Console.WriteLine("{\"backend\":\"windows-lpac-job\",\"version\":1}"); return 0; }
        IntPtr sid = IntPtr.Zero, job = IntPtr.Zero, attributes = IntPtr.Zero, environment = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        List<IntPtr> allocations = new List<IntPtr>(), handles = new List<IntPtr>();
        List<IntPtr> localAllocations = new List<IntPtr>();
        string profile = "PaperPet.Analysis." + Guid.NewGuid().ToString("N"), runtime = null;
        SecurityIdentifier identity = null;
        bool runtimeGranted = false, started = false;
        int exit = 1;
        Dictionary<string,object> result = new Dictionary<string,object>();
        try {
            if (args.Length != 1) throw new ArgumentException("Expected a trusted control file");
            Dictionary<string,object> config = json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));
            runtime = Path.GetFullPath((string)config["runtime"]);
            string input = Path.GetFullPath((string)config["input"]), output = Path.GetFullPath((string)config["output"]), control = Path.GetFullPath((string)config["control"]);
            int timeout = Math.Max(100, Math.Min(600000, Convert.ToInt32(config["timeoutMs"])));
            long memory = Math.Max(64, Math.Min(2048, Convert.ToInt64(config["memoryMb"]))) * 1024 * 1024;
            string executable = Path.Combine(runtime, "python.exe"), script = Path.Combine(input, "analysis_script.py");
            if (!File.Exists(executable) || !File.Exists(script)) throw new FileNotFoundException("Sandbox runtime/input missing");
            int hr = CreateAppContainerProfile(profile, profile, "Isolated paper analysis", IntPtr.Zero, 0, out sid);
            if (hr != 0) Marshal.ThrowExceptionForHR(hr);
            identity = new SecurityIdentifier(sid);
            Grant(runtime, identity, FileSystemRights.ReadAndExecute, true, false); runtimeGranted = true;
            Grant(Path.GetDirectoryName(input), identity, FileSystemRights.Traverse | FileSystemRights.Synchronize, false, false);
            Grant(input, identity, FileSystemRights.ReadAndExecute, true, false);
            Grant(output, identity, FileSystemRights.Modify, true, false);
            LowIntegrity(output);

            job = CreateJobObjectW(IntPtr.Zero, null); Check(job != IntPtr.Zero);
            EXTENDED_LIMITS limits = new EXTENDED_LIMITS();
            limits.basic.flags = 0x2000 | 0x200 | 0x100 | 0x8 | 0x400;
            limits.basic.activeProcesses = 1;
            limits.processMemory = new UIntPtr((ulong)memory); limits.jobMemory = new UIntPtr((ulong)memory);
            IntPtr limitsPtr = Allocate(limits); allocations.Add(limitsPtr);
            Check(SetInformationJobObject(job, 9, limitsPtr, (uint)Marshal.SizeOf(typeof(EXTENDED_LIMITS))));
            IntPtr uiPtr = Allocate((uint)0xFF); allocations.Add(uiPtr);
            Check(SetInformationJobObject(job, 4, uiPtr, 4));

            IntPtr bytesNeeded = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 4, 0, ref bytesNeeded);
            attributes = Marshal.AllocHGlobal(bytesNeeded);
            Check(InitializeProcThreadAttributeList(attributes, 4, 0, ref bytesNeeded));
            SECURITY_CAPABILITIES caps = new SECURITY_CAPABILITIES(); caps.sid = sid;
            IntPtr groups, capabilitySids; uint groupCount, capabilityCount;
            Check(DeriveCapabilitySidsFromName("registryRead", out groups, out groupCount, out capabilitySids, out capabilityCount));
            for (int i=0; i<groupCount; i++) localAllocations.Add(Marshal.ReadIntPtr(groups, i * IntPtr.Size));
            for (int i=0; i<capabilityCount; i++) localAllocations.Add(Marshal.ReadIntPtr(capabilitySids, i * IntPtr.Size));
            localAllocations.Add(groups); localAllocations.Add(capabilitySids);
            SID_AND_ATTRIBUTES registryCapability = new SID_AND_ATTRIBUTES(); registryCapability.sid = Marshal.ReadIntPtr(capabilitySids); registryCapability.attributes = 4;
            IntPtr registryCapabilityPtr = Allocate(registryCapability); allocations.Add(registryCapabilityPtr);
            caps.capabilities = registryCapabilityPtr; caps.count = 1;
            IntPtr capsPtr = Allocate(caps); allocations.Add(capsPtr);
            Attribute(attributes, 0x20009, capsPtr, Marshal.SizeOf(typeof(SECURITY_CAPABILITIES)));
            IntPtr lpacPtr = Allocate((uint)1); allocations.Add(lpacPtr);
            Attribute(attributes, 0x2000F, lpacPtr, 4);
            // Disable extension points and images from remote devices. Job UI limits
            // restrict UI operations without disabling Windows graphics DLL loading.
            IntPtr mitigationPtr = Allocate(0x100000000UL | 0x10000000000000UL); allocations.Add(mitigationPtr);
            Attribute(attributes, 0x20007, mitigationPtr, 8);

            SECURITY_ATTRIBUTES sa = new SECURITY_ATTRIBUTES(); sa.length = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); sa.inherit = true;
            string stdoutPath = Path.Combine(control, "stdout.log"), stderrPath = Path.Combine(control, "stderr.log");
            foreach (string file in new string[] { "NUL", stdoutPath, stderrPath }) {
                IntPtr handle = CreateFileW(file, file == "NUL" ? 0x80000000U : 0x40000000U, 3, ref sa, file == "NUL" ? 3U : 2U, 0x80, IntPtr.Zero);
                Check(handle != new IntPtr(-1)); handles.Add(handle);
            }
            IntPtr handleList = Marshal.AllocHGlobal(IntPtr.Size * handles.Count); allocations.Add(handleList);
            for (int i=0; i<handles.Count; i++) Marshal.WriteIntPtr(handleList, i * IntPtr.Size, handles[i]);
            Attribute(attributes, 0x20002, handleList, IntPtr.Size * handles.Count);

            Dictionary<string,string> env = new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
            string windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            env["SystemRoot"] = windows; env["WINDIR"] = windows; env["PATH"] = runtime;
            env["DATA_FILE"] = (string)config["dataName"] == "" ? "" : Path.Combine(input, Path.GetFileName((string)config["dataName"]));
            env["CHART_DIR"] = Path.Combine(output, "charts");
            env["TEMP"] = env["TMP"] = Path.Combine(output, "tmp");
            env["USERPROFILE"] = env["HOME"] = env["APPDATA"] = env["LOCALAPPDATA"] = Path.Combine(output, "profile");
            env["MPLCONFIGDIR"] = Path.Combine(output, "mpl"); env["MPLBACKEND"] = "Agg";
            env["OPENBLAS_NUM_THREADS"] = env["OMP_NUM_THREADS"] = env["MKL_NUM_THREADS"] = "2";
            env["JOBLIB_MULTIPROCESSING"] = "0";
            List<string> keys = new List<string>(env.Keys); keys.Sort(StringComparer.OrdinalIgnoreCase);
            StringBuilder block = new StringBuilder(); foreach (string key in keys) block.Append(key).Append('=').Append(env[key]).Append('\0'); block.Append('\0');
            environment = Marshal.StringToHGlobalUni(block.ToString());
            STARTUPINFOEX startup = new STARTUPINFOEX(); startup.info.cb = Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.attributes = attributes;
            startup.info.flags = 0x100; startup.info.stdin = handles[0]; startup.info.stdout = handles[1]; startup.info.stderr = handles[2];
            Check(CreateProcessW(executable, new StringBuilder(Quote(executable) + " -I -B -X utf8 " + Quote(script)), IntPtr.Zero, IntPtr.Zero, true,
                0x80000 | 0x4 | 0x400 | 0x08000000, environment, output, ref startup, out process));
            started = true;
            Check(AssignProcessToJobObject(job, process.process));
            IntPtr token; Check(OpenProcessToken(process.process, 8, out token));
            try {
                IntPtr value = Marshal.AllocHGlobal(4); allocations.Add(value); int returned;
                Check(GetTokenInformation(token, 29, value, 4, out returned));
                if (Marshal.ReadInt32(value) != 1) throw new InvalidOperationException("Child is not an AppContainer");
            } finally { CloseHandle(token); }
            if (ResumeThread(process.thread) == 0xFFFFFFFF) throw new Win32Exception(Marshal.GetLastWin32Error());
            Stopwatch watch = Stopwatch.StartNew();
            string reason = null;
            while (WaitForSingleObject(process.process, 50) == 0x102) {
                if (File.Exists(Path.Combine(control, "cancel"))) reason = "canceled";
                else if (watch.ElapsedMilliseconds >= timeout) reason = "timeout";
                else if (new FileInfo(stdoutPath).Length + new FileInfo(stderrPath).Length > 2 * 1024 * 1024) reason = "output-limit";
                else if (TreeSize(output) > 128L * 1024 * 1024) reason = "output-limit";
                if (reason != null) { Check(TerminateJobObject(job, 1)); WaitForSingleObject(process.process, 5000); break; }
            }
            uint code; Check(GetExitCodeProcess(process.process, out code));
            result["backend"] = "windows-lpac-job"; result["appContainer"] = true; result["networkCapabilities"] = 0;
            result["capabilities"] = new string[] { "registryRead" };
            result["exitCode"] = code; result["reason"] = reason; result["stdout"] = ReadBounded(stdoutPath); result["stderr"] = ReadBounded(stderrPath);
            result["memoryMb"] = memory / 1024 / 1024; result["processLimit"] = 1;
            exit = 0;
        } catch (Exception error) {
            result["backend"] = "windows-lpac-job"; result["error"] = "Sandbox setup/execution failed: " + error.Message;
        } finally {
            if (started && process.process != IntPtr.Zero) { TerminateProcess(process.process, 1); WaitForSingleObject(process.process, 5000); }
            if (job != IntPtr.Zero) { TerminateJobObject(job, 1); CloseHandle(job); }
            if (process.thread != IntPtr.Zero) CloseHandle(process.thread);
            if (process.process != IntPtr.Zero) CloseHandle(process.process);
            foreach (IntPtr handle in handles) CloseHandle(handle);
            if (attributes != IntPtr.Zero) { DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); }
            foreach (IntPtr ptr in allocations) Marshal.FreeHGlobal(ptr);
            foreach (IntPtr ptr in localAllocations) LocalFree(ptr);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
            if (runtimeGranted) { try { Grant(runtime, identity, FileSystemRights.ReadAndExecute, true, true); } catch { result["cleanupWarning"] = "runtime-acl"; } }
            if (sid != IntPtr.Zero) FreeSid(sid);
            DeleteAppContainerProfile(profile);
        }
        Console.WriteLine(json.Serialize(result));
        return exit;
    }
}
