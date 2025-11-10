import React, { useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
} from "firebase/firestore";
import toast from "react-hot-toast";
import { LayoutDashboard, CalendarDays, LogOut, Users } from "lucide-react";

export default function AdminDashboard() {
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [attendance, setAttendance] = useState([]);
  const [admin, setAdmin] = useState(null);
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [activeTab, setActiveTab] = useState("daily");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();

  // 🔹 AUTH + DATA INITIALIZATION
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/");
        return;
      }

      setAdmin(currentUser);
      await fetchDailySummary();
      await fetchWeeklySummary();
      await fetchAttendanceForDate(selectedDate);
    });

    return () => unsubscribe();
  }, [navigate, selectedDate]);

  // 🔹 FETCH ATTENDANCE FOR SELECTED DATE
  const fetchAttendanceForDate = async (date) => {
    const snapshot = await getDocs(collection(db, "attendance"));
    const filtered = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((r) => r.date === date);
    setAttendance(filtered);
  };

  // 🔹 FETCH DAILY SUMMARY
  const fetchDailySummary = async () => {
    const today = new Date().toISOString().split("T")[0];
    const summaryRef = doc(db, "dailySummary", today);
    const summarySnap = await getDoc(summaryRef);

    if (summarySnap.exists()) {
      setSummary(summarySnap.data());
    } else {
      setSummary(null);
    }

    const recordsRef = collection(db, `dailySummary/${today}/records`);
    const querySnapshot = await getDocs(recordsRef);
    const recordsData = querySnapshot.docs.map((doc) => doc.data());
    setRecords(recordsData);
  };

  // 🔹 FETCH WEEKLY SUMMARY
  const fetchWeeklySummary = async () => {
    const q = query(collection(db, "dailySummary"));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map((doc) => ({
      date: doc.id,
      ...doc.data(),
    }));
    data.sort((a, b) => new Date(b.date) - new Date(a.date));
    setWeeklyData(data.slice(0, 7).reverse());
  };

  // 🔹 LOGOUT
  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Logged out successfully!");
    navigate("/");
  };

  return (
    <div className="min-h-screen flex bg-[#121212] text-white">
      {/* SIDEBAR */}
      <div className="w-64 bg-[#1A1A1A] border-r border-neutral-800 flex flex-col justify-between">
        <div className="p-6">
          <h2 className="text-2xl font-semibold mb-8 text-white">Admin Panel</h2>
          <div className="space-y-4">
            <div
              onClick={() => setActiveTab("daily")}
              className={`flex items-center gap-3 cursor-pointer ${
                activeTab === "daily"
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <LayoutDashboard size={18} />
              <span>Daily Report</span>
            </div>
            <div
              onClick={() => setActiveTab("weekly")}
              className={`flex items-center gap-3 cursor-pointer ${
                activeTab === "weekly"
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <CalendarDays size={18} />
              <span>Weekly Report</span>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-800">
          <div className="flex items-center gap-3 mb-4">
            <Users size={18} className="text-gray-400" />
            <div>
              <p className="text-sm text-gray-400">Logged in as</p>
              <p className="font-medium">{admin?.email || "Admin"}</p>
            </div>
          </div>
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center justify-center w-full bg-white text-black py-2 rounded-lg hover:bg-neutral-300 transition-all font-medium"
          >
            <LogOut size={16} className="mr-2" /> Logout
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-10">
        {activeTab === "daily" ? (
          <>
            <h1 className="text-3xl font-bold mb-8">Daily Summary Dashboard</h1>

            {/* 🔹 Attendance Management Section */}
            <div className="bg-[#1C1C1C] border border-neutral-700 rounded-3xl shadow-lg p-8 mb-10">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Daily Attendance - {selectedDate}</h2>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-[#121212] text-white border border-neutral-700 px-4 py-2 rounded-lg"
                  />
                  <button
                    onClick={() => {
                      setEditingRecord({ date: selectedDate });
                      setShowEditModal(true);
                    }}
                    className="bg-white text-black px-4 py-2 rounded-lg hover:bg-neutral-300"
                  >
                    + Add Record
                  </button>
                </div>
              </div>

              {/* Attendance Table */}
              <table className="min-w-full bg-[#1A1A1A] border border-neutral-700 rounded-xl">
                <thead>
                  <tr className="text-gray-400 text-sm uppercase">
                    <th className="py-3 px-4 text-left">Employee</th>
                    <th className="py-3 px-4 text-left">Time In</th>
                    <th className="py-3 px-4 text-left">Time Out</th>
                    <th className="py-3 px-4 text-left">Regular</th>
                    <th className="py-3 px-4 text-left">Overtime</th>
                    <th className="py-3 px-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.length > 0 ? (
                    attendance.map((rec) => (
                      <tr key={rec.id} className="hover:bg-neutral-700/40 transition">
                        <td className="py-2 px-4">{rec.name || "Unknown"}</td>
                        <td className="py-2 px-4">{rec.timeIn ? new Date(rec.timeIn).toLocaleTimeString() : "--"}</td>
                        <td className="py-2 px-4">{rec.timeOut ? new Date(rec.timeOut).toLocaleTimeString() : "--"}</td>
                        <td className="py-2 px-4">{rec.regular?.toFixed(2) || "--"}</td>
                        <td className="py-2 px-4">{rec.overtime?.toFixed(2) || "--"}</td>
                        <td className="py-2 px-4">
                          <button
                            onClick={() => {
                              setEditingRecord(rec);
                              setShowEditModal(true);
                            }}
                            className="text-sm bg-white text-black px-3 py-1 rounded-lg hover:bg-neutral-300"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center py-6 text-gray-400 text-sm">
                        No records found for this date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Existing Daily Summary Table */}
            {summary ? (
              <div className="bg-[#1C1C1C] border border-neutral-800 rounded-3xl shadow-lg p-8">
                <h2 className="text-2xl font-semibold mb-6">Employee Breakdown</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full rounded-xl overflow-hidden">
                    <thead>
                      <tr className="bg-neutral-800 text-gray-400 uppercase text-sm tracking-wider">
                        <th className="py-3 px-4 text-left">Name</th>
                        <th className="py-3 px-4 text-left">Regular</th>
                        <th className="py-3 px-4 text-left">Overtime</th>
                        <th className="py-3 px-4 text-left">Night Diff</th>
                        <th className="py-3 px-4 text-left">Late</th>
                        <th className="py-3 px-4 text-left">Undertime</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length > 0 ? (
                        records.map((rec, index) => (
                          <tr
                            key={rec.name + index}
                            className={`${index % 2 === 0 ? "bg-[#181818]" : "bg-[#202020]"} hover:bg-neutral-700/50 transition`}
                          >
                            <td className="py-3 px-4 text-sm text-gray-200">{rec.name}</td>
                            <td className="py-3 px-4 text-sm text-gray-200">{rec.regular?.toFixed(2) || "--"} hrs</td>
                            <td className="py-3 px-4 text-sm text-gray-200">{rec.overtime?.toFixed(2) || "--"} hrs</td>
                            <td className="py-3 px-4 text-sm text-gray-200">{rec.nightDiff?.toFixed(2) || "--"} hrs</td>
                            <td className="py-3 px-4 text-sm text-gray-200">{rec.late?.toFixed(2) || "--"} mins</td>
                            <td className="py-3 px-4 text-sm text-gray-200">{rec.undertime?.toFixed(2) || "--"} mins</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" className="py-6 text-center text-gray-500 text-sm">
                            No employees have timed in today.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-gray-400 text-center mt-20">No daily summary found for today.</p>
            )}
          </>
        ) : (
          // WEEKLY REPORT
          <div className="bg-[#1C1C1C] border border-neutral-800 rounded-3xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-6">Weekly Report</h2>
            {weeklyData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-neutral-800 text-gray-400 uppercase text-sm tracking-wider">
                      <th className="py-3 px-4 text-left">Date</th>
                      <th className="py-3 px-4 text-left">Regular</th>
                      <th className="py-3 px-4 text-left">Overtime</th>
                      <th className="py-3 px-4 text-left">Night Diff</th>
                      <th className="py-3 px-4 text-left">Late</th>
                      <th className="py-3 px-4 text-left">Undertime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyData.map((day, index) => (
                      <tr
                        key={day.date}
                        className={`${index % 2 === 0 ? "bg-[#181818]" : "bg-[#202020]"} hover:bg-neutral-700/50 transition`}
                      >
                        <td className="py-3 px-4 text-sm text-gray-200">{day.date}</td>
                        <td className="py-3 px-4 text-sm text-gray-200">{day.totalRegular?.toFixed(2) || "--"} hrs</td>
                        <td className="py-3 px-4 text-sm text-gray-200">{day.totalOvertime?.toFixed(2) || "--"} hrs</td>
                        <td className="py-3 px-4 text-sm text-gray-200">{day.totalNightDiff?.toFixed(2) || "--"} hrs</td>
                        <td className="py-3 px-4 text-sm text-gray-200">{day.totalLate?.toFixed(2) || "--"} mins</td>
                        <td className="py-3 px-4 text-sm text-gray-200">{day.totalUndertime?.toFixed(2) || "--"} mins</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-center mt-20">No weekly data available.</p>
            )}
          </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#1C1C1C] p-6 rounded-2xl border border-neutral-700 w-[90%] max-w-md">
            <h3 className="text-xl font-semibold mb-4">Edit Attendance</h3>

            <label className="block mb-2 text-sm">Time In</label>
            <input
              type="datetime-local"
              defaultValue={editingRecord.timeIn ? new Date(editingRecord.timeIn).toISOString().slice(0, 16) : ""}
              onChange={(e) => setEditingRecord({ ...editingRecord, timeIn: e.target.value })}
              className="w-full mb-4 p-2 rounded bg-neutral-800 text-white border border-neutral-700"
            />

            <label className="block mb-2 text-sm">Time Out</label>
            <input
              type="datetime-local"
              defaultValue={editingRecord.timeOut ? new Date(editingRecord.timeOut).toISOString().slice(0, 16) : ""}
              onChange={(e) => setEditingRecord({ ...editingRecord, timeOut: e.target.value })}
              className="w-full mb-4 p-2 rounded bg-neutral-800 text-white border border-neutral-700"
            />

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 bg-neutral-700 rounded-lg">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editingRecord.timeIn || !editingRecord.timeOut) {
                    toast.error("Please fill in both Time In and Time Out!");
                    return;
                  }
                  await setDoc(doc(db, "attendance", editingRecord.id || `${Date.now()}`), editingRecord, { merge: true });
                  setShowEditModal(false);
                  fetchAttendanceForDate(selectedDate);
                  toast.success("Attendance record saved successfully!");
                }}
                className="px-4 py-2 bg-white text-black rounded-lg hover:bg-neutral-300"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOGOUT MODAL */}
      {showLogoutConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-all">
          <div className="bg-[#1C1C1C] border border-neutral-700 rounded-2xl p-8 text-center w-[90%] max-w-sm shadow-2xl animate-fadeIn">
            <h2 className="text-lg font-semibold mb-4 text-white">Confirm Logout</h2>
            <p className="text-gray-400 text-sm mb-6">Are you sure you want to log out?</p>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-6 py-2 rounded-lg bg-neutral-700 text-gray-300 hover:bg-neutral-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-6 py-2 rounded-lg bg-white text-black hover:bg-neutral-300 font-medium transition-all"
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
