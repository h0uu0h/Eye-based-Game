import { useState, useEffect } from "react";
import "./App.css";
import BlinkGame from "./components/BlinkGame";
import BgImage from "/bg.png";

function App() {
    const [gameWake, setGameWake] = useState(false);

    const handleToggleGame = () => {
        setGameWake((prev) => !prev);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            handleToggleGame(); // 2分钟后自动开始
        }, 2 * 1000); // 2分钟
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            className="app-container"
            style={{ textAlign: "center" ,  }}>
            <img
                src={BgImage}
                alt="Default Camera"
                onClick={() => window.location.reload()}
                style={{
                    position: "absolute",
                    height: "100%",
                    width: "100%",
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    objectFit: "cover",
                    cursor: "pointer",
                }}
            />
            {gameWake && <BlinkGame />}
        </div>
    );
}

export default App;
