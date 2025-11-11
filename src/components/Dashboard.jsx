import React, { useState, useEffect } from "react";
import { auth, db } from "../firebaseConfig";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [record, setRecord] = useState(null);
  const [history, setHistory] = useState([]);
  const [userData, setUserData] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();

  // ✅ Handle user session + data fetching
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        navigate("/");
        return;
      }

      setUser(currentUser);

      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
      else toast.error("User record not found in Firestore!");

      await fetchTodayRecord(currentUser);
      await fetchAttendanceHistory(currentUser);
    });

    return () => unsubscribe();
  }, [navigate]);

  // ✅ Fetch today's record
  const fetchTodayRecord = async (user) => {
    const today = new Date().toISOString().split("T")[0];
    const docRef = doc(db, "attendance", `${user.uid}_${today}`);
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      setRecord(snapshot.data());
    } else {
      setRecord(null);
    }
  };

  // ✅ Fetch attendance history
  const fetchAttendanceHistory = async (user) => {
    const q = query(collection(db, "attendance"), where("uid", "==", user.uid));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    setHistory(data);
  };

  // ✅ Auto reset daily at midnight
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        setRecord(null);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ✅ Time In
  const handleTimeIn = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const docRef = doc(db, "attendance", `${user.uid}_${today}`);

    const existing = await getDoc(docRef);
    if (existing.exists() && existing.data().timeIn) {
      toast.error("You have already timed in today!");
      return;
    }

    await setDoc(
      docRef,
      { uid: user.uid, date: today, timeIn: now.toISOString() },
      { merge: true }
    );

    setRecord({ uid: user.uid, date: today, timeIn: now.toISOString() });
    await fetchAttendanceHistory(user);
    toast.success("Time In recorded!");
  };

  // ✅ Time Out
  const handleTimeOut = async () => {
    if (!user) return;
    if (!record?.timeIn) {
      toast.error("Please time in first!");
      return;
    }
    if (record?.timeOut) {
      toast.error("You have already timed out today!");
      return;
    }

    const now = new Date();
    const timeIn = new Date(record.timeIn);
    const totalHours = (now - timeIn) / (1000 * 60 * 60);

    const schedStart = new Date(timeIn);
    schedStart.setHours(9, 0, 0);
    const schedEnd = new Date(timeIn);
    schedEnd.setHours(18, 0, 0);

    const late = Math.max(0, (timeIn - schedStart) / (1000 * 60));
    const undertime = now < schedEnd ? (schedEnd - now) / (1000 * 60) : 0;
    const regular = Math.min(totalHours, 9);
    const overtime = totalHours > 9 ? totalHours - 9 : 0;

    const nightDiff = computeNightDiffHours(record.timeIn, now);

    const docRef = doc(db, "attendance", `${user.uid}_${record.date}`);
    await setDoc(
      docRef,
      {
        timeOut: now.toISOString(),
        regular: parseFloat(regular.toFixed(2)),
        overtime: parseFloat(overtime.toFixed(2)),
        late: parseFloat(late.toFixed(2)),
        undertime: parseFloat(undertime.toFixed(2)),
        nightDiff: parseFloat(nightDiff.toFixed(2)),
      },
      { merge: true }
    );

    toast.success("Time Out recorded!");

    setRecord((prev) => ({
      ...prev,
      timeOut: now.toISOString(),
      regular,
      overtime,
      late,
      undertime,
      nightDiff,
    }));

    await fetchAttendanceHistory(user);
  };

  // ✅ Night Differential (22:00 – 06:00)
  const computeNightDiffHours = (timeInISO, timeOutDate) => {
    const timeIn = new Date(timeInISO);
    const timeOut = new Date(timeOutDate);

    const nd1Start = new Date(timeIn);
    nd1Start.setHours(22, 0, 0, 0);
    const nd1End = new Date(nd1Start);
    nd1End.setHours(24, 0, 0, 0);

    const nd2Start = new Date(nd1End);
    const nd2End = new Date(nd2Start);
    nd2End.setHours(6, 0, 0, 0);

    const overlapMs = (aStart, aEnd, bStart, bEnd) => {
      const start = Math.max(aStart.getTime(), bStart.getTime());
      const end = Math.min(aEnd.getTime(), bEnd.getTime());
      return Math.max(0, end - start);
    };

    const msND =
      overlapMs(timeIn, timeOut, nd1Start, nd1End) +
      overlapMs(timeIn, timeOut, nd2Start, nd2End);

    return parseFloat((msND / (1000 * 60 * 60)).toFixed(2));
  };

  // ✅ Logout
  const handleLogout = async () => {
    await signOut(auth);
    toast.success("Logged out successfully!");
    navigate("/");
  };

  // Formatters
  const formatTime = (isoString) => {
    if (!isoString) return "--";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // ✅ UI rendering (always visible)
  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212] text-gray-400 text-lg">
        Loading your dashboard...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#121212] text-white px-6 py-10 md:px-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-10 border-b border-neutral-700 pb-4">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Mini HCM <span className="text-gray-400 font-light">Dashboard</span>
        </h1>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className="bg-white text-black font-semibold px-6 py-2 rounded-xl hover:bg-neutral-300 transition-all shadow"
        >
          Logout
        </button>
      </div>

      {/* Welcome */}
      <div className="bg-[#1A1A1A] border border-neutral-700 rounded-3xl shadow-xl p-8 mb-10">
        <h2 className="text-xl font-semibold mb-2">
          Welcome back,{" "}
          <span className="text-gray-300 font-light">
            {userData?.name || "Employee"}
          </span>
        </h2>
        <p className="text-gray-400 text-sm">
          Manage your attendance records and daily punches below.
        </p>
      </div>

      {/* Punch Section */}
      <div className="bg-[#1C1C1C] border border-neutral-700 rounded-3xl shadow-lg p-8 mb-10">
        <div className="flex justify-around text-center mb-8">
          <div>
            <p className="text-gray-500 text-sm">Time In</p>
            <p className="text-2xl font-semibold text-white">
              {record?.timeIn ? formatTime(record.timeIn) : "--:--"}
            </p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Time Out</p>
            <p className="text-2xl font-semibold text-white">
              {record?.timeOut ? formatTime(record.timeOut) : "--:--"}
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-6">
          <button
            onClick={handleTimeIn}
            disabled={!!record?.timeIn}
            className={`px-8 py-3 rounded-xl font-semibold transition-all ${
              record?.timeIn
                ? "bg-neutral-700 cursor-not-allowed text-gray-400"
                : "bg-white text-black hover:bg-neutral-300 shadow-md"
            }`}
          >
            Punch In
          </button>
          <button
            onClick={handleTimeOut}
            disabled={!record?.timeIn || !!record?.timeOut}
            className={`px-8 py-3 rounded-xl font-semibold transition-all ${
              record?.timeOut
                ? "bg-neutral-700 cursor-not-allowed text-gray-400"
                : "bg-white text-black hover:bg-neutral-300 shadow-md"
            }`}
          >
            Punch Out
          </button>
        </div>
      </div>

      {/* Attendance History */}
      <div className="bg-[#1C1C1C] border border-neutral-700 rounded-3xl shadow-lg p-8">
        <h3 className="text-2xl font-semibold mb-6 text-white">
          Attendance History
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-neutral-800 text-gray-400 uppercase text-sm tracking-wider">
                <th className="py-3 px-4 text-left">Date</th>
                <th className="py-3 px-4 text-left">Time In</th>
                <th className="py-3 px-4 text-left">Time Out</th>
                <th className="py-3 px-4 text-left">Regular</th>
                <th className="py-3 px-4 text-left">Overtime</th>
                <th className="py-3 px-4 text-left">Night Diff</th>
                <th className="py-3 px-4 text-left">Late</th>
                <th className="py-3 px-4 text-left">Undertime</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? (
                history.map((entry, index) => (
                  <tr
                    key={entry.date}
                    className={`${
                      index % 2 === 0 ? "bg-[#181818]" : "bg-[#202020]"
                    } hover:bg-neutral-700/50 transition`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {formatDate(entry.date)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {formatTime(entry.timeIn)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {formatTime(entry.timeOut)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {entry.regular?.toFixed(2) || "--"} hrs
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {entry.overtime?.toFixed(2) || "--"} hrs
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {entry.nightDiff?.toFixed(2) || "--"} hrs
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {entry.late?.toFixed(2) || "--"} mins
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-200">
                      {entry.undertime?.toFixed(2) || "--"} mins
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="8"
                    className="py-6 text-center text-gray-500 text-sm"
                  >
                    No attendance records yet.
                  </td>
                </tr>
              )}

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

              
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
