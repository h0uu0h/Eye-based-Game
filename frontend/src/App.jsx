import { useState } from "react";
import "./App.css";
import BlinkGame from "./components/BlinkGame";

function App() {
    const [gameStarted, setGameStarted] = useState(false);

    const handleToggleGame = () => {
        setGameStarted((prev) => !prev);
    };

    return (
        <div
            className="app-container"
            style={{ textAlign: "center", paddingTop: "20px" }}>
            <button
                onClick={handleToggleGame}
                style={{
                    padding: "10px 20px",
                    fontSize: "18px",
                    marginBottom: "20px",
                    cursor: "pointer",
                    backgroundColor: gameStarted ? "#f44336" : "#4CAF50",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                }}>
                {gameStarted ? "End Game" : "Start Game"}
            </button>

            {gameStarted && <BlinkGame />}
        </div>
    );
}

export default App;
