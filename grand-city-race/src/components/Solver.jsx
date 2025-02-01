import React, { useState, useEffect } from "react";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function Solver({ user, db }) {
  const [quest, setQuest] = useState(null);
  const [answer, setAnswer] = useState("");
  const [nextHint, setNextHint] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const fetchQuest = async () => {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      if (!userData.teamId) return;

      const teamRef = doc(db, "teams", userData.teamId);
      const teamSnap = await getDoc(teamRef);
      if (!teamSnap.exists()) return;

      const teamData = teamSnap.data();
      if (teamData.progress?.currentQuest) {
        const questRef = doc(db, "quests", teamData.progress.currentQuest);
        const questSnap = await getDoc(questRef);
        if (questSnap.exists()) {
          setQuest({ id: teamData.progress.currentQuest, ...questSnap.data() });

          // Fetch next quest hint if available
          if (questSnap.data().nextQuestId) {
            const nextQuestRef = doc(db, "quests", questSnap.data().nextQuestId);
            const nextQuestSnap = await getDoc(nextQuestRef);
            if (nextQuestSnap.exists()) {
              setNextHint(nextQuestSnap.data().hint);
            }
          }
        }
      }
    };

    fetchQuest();
  }, [user, db]);

  const handleAnswerSubmit = async () => {
    if (!quest) {
      alert("No active quest found!");
      return;
    }

    if (answer.trim().toLowerCase() !== quest.answer.toLowerCase()) {
      alert("Incorrect answer! Try again.");
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      if (!userData.teamId) return;

      const teamRef = doc(db, "teams", userData.teamId);
      if (quest.nextQuestId) {
        // Update team progress to next quest
        await updateDoc(teamRef, {
          "progress.currentQuest": quest.nextQuestId,
          "progress.previousQuests": arrayUnion(quest.id),
        });
        alert(`Correct! Here’s your hint: ${nextHint || "No hint available."}`);
        navigate("/dashboard");
      } else {
        // No nextQuestId, meaning this is the last quest
        setGameOver(true);
      }
    } catch (err) {
      console.error("Error updating quest progress:", err);
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      {gameOver ? (
        <div>
          <h2>🎉 Congratulations! 🎉</h2>
          <p>Your team has completed the race!</p>
          <button onClick={() => navigate("/dashboard")}>Return to Dashboard</button>
        </div>
      ) : (
        <div>
          {quest && <h3>{quest.text}</h3>}
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <button onClick={handleAnswerSubmit}>Submit</button>
        </div>
      )}
    </div>
  );
}

export default Solver;
