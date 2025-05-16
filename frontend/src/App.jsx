import { useState } from "react";
import "./App.css";
import BlinkGame from "./components/BlinkGame";

function App() {
    const [gameStarted, setGameStarted] = useState(false);

    const handleToggleGame = async () => {
        if (!gameStarted) {
            await fetch("http://localhost:5000/start_stream", {
                method: "POST",
            });
            setGameStarted(true);
        } else {
            await fetch("http://localhost:5000/stop_stream", {
                method: "POST",
            });
            setGameStarted(false);
        }
    };

    return (
        <div
            className="app-container"
            style={{ textAlign: "center", paddingTop: "20px" }}>
            <h1>Blink Game</h1>
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
