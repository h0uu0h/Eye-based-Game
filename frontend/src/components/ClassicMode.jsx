/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import blinkSound from "/sounds/blink.wav";
import startSound from "/sounds/start.wav";
import missSound from "/sounds/miss.wav";

const ClassicMode = ({ onGameEnd }) => {
    const canvasRef = useRef(null);
    const audioRef = useRef(null);
    const startAudioRef = useRef(null);
    const missAudioRef = useRef(null);

    const taskSucceededRef = useRef(false);
    const taskActiveRef = useRef(false);

    const [score, setScore] = useState(0);
    const scoreRef = useRef(0);

    const [missCount, setMissCount] = useState(0);
    const missRef = useRef(0);

    const [blinkCount, setBlinkCount] = useState(0);
    const blinkRef = useRef(0);

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
            reconnectionAttempts: 3,
            autoConnect: true,
        });

        socket.on("blink_event", (data) => {
            setBlinkCount(data.total);
            blinkRef.current = data.total;

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "30px Arial";
            ctx.fillStyle = "red";
            ctx.fillText("Blink!", 50, 50);

            if (audioRef.current) audioRef.current.play();

            if (taskActiveRef.current) {
                setScore((prev) => {
                    const next = prev + 1;
                    scoreRef.current = next;
                    return next;
                });
                taskSucceededRef.current = true;
            }

            setTimeout(() => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }, 500);
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (!onGameEnd) return;

            const score = scoreRef.current;
            const missCount = missRef.current;
            const total = score + missCount;
            if (total === 0) return;

            const successRate = score / total;
            const playCount =
                parseInt(localStorage.getItem("playCount") || "0", 10) + 1;
            localStorage.setItem("playCount", playCount);

            const history = JSON.parse(
                localStorage.getItem("blinkGameHistory") || "[]"
            );
            const gameData = {
                mode:"classic",
                timestamp: Date.now(),
                score,
                missCount,
                successRate,
            };
            history.push(gameData);
            localStorage.setItem("blinkGameHistory", JSON.stringify(history));

            const rates = history
                .filter((g) => g.mode === "classic")
                .map((g) => g.successRate)
                .sort((a, b) => b - a);
            const rank = rates.findIndex((r) => r === successRate) + 1;

            onGameEnd({
                mode:"classic",
                score,
                missCount,
                successRate,
                playCount,
                rank,
                totalGames: rates.length,
            });
        };
    }, []);

    useEffect(() => {
        let timer;
        const triggerTask = () => {
            taskActiveRef.current = true;
            taskSucceededRef.current = false;

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            ctx.font = "24px Arial";
            ctx.fillStyle = "yellow";
            ctx.fillText("Blink now!", 50, 100);

            setTimeout(() => {
                taskActiveRef.current = false;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (!taskSucceededRef.current) {
                    setMissCount((prev) => {
                        const next = prev + 1;
                        missRef.current = next;
                        return next;
                    });
                    missAudioRef.current?.play();

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "orange";
                    ctx.fillText("Miss!", 50, 80);

                    setTimeout(() => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }, 800);
                }

                timer = setTimeout(triggerTask, 3000 + Math.random() * 4000);
            }, 1000);

            startAudioRef.current?.play();
        };

        timer = setTimeout(triggerTask, 2000 + Math.random() * 3000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <>
            <canvas
                ref={canvasRef}
                width="640"
                height="480"
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    pointerEvents: "none",
                }}
            />
            <audio ref={audioRef} src={blinkSound} preload="auto" />
            <audio ref={startAudioRef} src={startSound} preload="auto" />
            <audio ref={missAudioRef} src={missSound} preload="auto" />

            <div
                style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    color: "white",
                    fontSize: "20px",
                    fontWeight: "bold",
                }}>
                Total Blinks: {blinkCount}
            </div>
            <div
                style={{
                    position: "absolute",
                    bottom: "10px",
                    right: "10px",
                    color: "white",
                    fontSize: "20px",
                    fontWeight: "bold",
                }}>
                Score: {score}
            </div>
            <div
                style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    color: "white",
                    fontSize: "18px",
                    fontWeight: "bold",
                }}>
                Misses: {missCount}
            </div>
        </>
    );
};

export default ClassicMode;
