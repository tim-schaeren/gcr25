import React, { useState } from "react";
import QrReader from "react-qr-scanner";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function QRScanner({ user, db }) {
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [scanning, setScanning] = useState(true);
  const navigate = useNavigate();

  const handleScan = async (data) => {
    if (!data) return;
    setScanning(false); // Stop scanning after detecting a QR code

    console.log("Scanned QR Code:", data.text);
    setError(null);

    try {
      const questId = data.text.trim();
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setError("User data not found.");
        return;
      }

      const userData = userSnap.data();
      if (!userData.teamId) {
        setError("User is not assigned to a team.");
        return;
      }

      const teamRef = doc(db, "teams", userData.teamId);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        setError("Team data not found.");
        return;
      }

      const teamData = teamSnap.data();
      if (teamData.progress?.previousQuests?.includes(questId)) {
        setError("❗ You already solved this quest!");
        return;
      }

      // Assign the new quest
      await updateDoc(teamRef, {
        "progress.currentQuest": questId,
      });

      setSuccessMessage("✅ Quest assigned! Redirecting...");
      setTimeout(() => navigate("/dashboard"), 2000); // Smooth redirect after 2 sec
    } catch (err) {
      setError("⚠️ Error processing QR code.");
      console.error("QR Code Processing Error:", err);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-screen min-h-screen bg-gray-900 text-white p-6">
      <h2 className="text-3xl font-bold mb-4">📸 Scan a QR Code</h2>

      {/* Scanner Container with fixed width to prevent shrinking */}
      <div className="w-full max-w-lg min-h-[350px] flex items-center justify-center">
        {scanning ? (
          <QrReader
            delay={300}
            constraints={{ video: { facingMode: "environment" } }}
            style={{ width: "100%", maxWidth: "400px", borderRadius: "10px" }}
            onError={(err) => setError("Camera error: " + err.message)}
            onScan={handleScan}
          />
        ) : (
          <div className="w-full h-[300px] flex items-center justify-center bg-gray-800 rounded-lg">
            {successMessage ? (
              <p className="text-green-400">{successMessage}</p>
            ) : error ? (
              <p className="text-red-400">{error}</p>
            ) : (
              <p className="text-gray-500">Scanner stopped</p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => navigate("/dashboard")}
        className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 transition text-white rounded-lg"
      >
        ← Back to Dashboard
      </button>
    </div>
  );
}

export default QRScanner;
