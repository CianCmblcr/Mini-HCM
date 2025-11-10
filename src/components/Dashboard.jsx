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

  // ✅ Fetch full attendance history
  const fetchAttendanceHistory = async (user) => {
    const q = query(collection(db, "attendance"), where("uid", "==", user.uid));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    setHistory(data);
  };

  // ✅ Auto-reset at midnight
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        setRecord(null);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ✅ Punch In
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

  // ✅ Punch Out
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

    // ✅ Daily Summary Update
    try {
      const summaryRef = doc(db, "dailySummary", record.date);
      const summarySnapshot = await getDoc(summaryRef);

      let currentTotals = {
        totalRegular: regular || 0,
        totalOvertime: overtime || 0,
        totalNightDiff: nightDiff || 0,
        totalLate: late || 0,
        totalUndertime: undertime || 0,
        totalEmployees: 1,
      };

      if (summarySnapshot.exists()) {
        const data = summarySnapshot.data();
        currentTotals = {
          totalRegular: (data.totalRegular || 0) + (regular || 0),
          totalOvertime: (data.totalOvertime || 0) + (overtime || 0),
          totalNightDiff: (data.totalNightDiff || 0) + (nightDiff || 0),
          totalLate: (data.totalLate || 0) + (late || 0),
          totalUndertime: (data.totalUndertime || 0) + (undertime || 0),
          totalEmployees: (data.totalEmployees || 0) + 1,
        };
      }

      await setDoc(summaryRef, currentTotals, { merge: true });

      await setDoc(
        doc(db, `dailySummary/${record.date}/records`, user.uid),
        {
          name: userData?.name || user.email,
          regular,
          overtime,
          nightDiff,
          late,
          undertime,
          timestamp: new Date().toISOString(),
        },
        { merge: true }
      );

      toast.success("✅ Time Out recorded successfully!");
    } catch (err) {
      toast.error("Error updating daily summary.");
      console.error("Error:", err);
    }

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

  // ✅ UI
  return (
    <div className="relative min-h-screen flex flex-col bg-[#121212] text-white px-6 py-10 md:px-20">
      {/* ... rest of your JSX stays unchanged */}
    </div>
  );
}
