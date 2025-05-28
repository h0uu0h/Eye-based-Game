/* eslint-disable no-unused-vars */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const MusicMode = () => {
    const canvasRef = useRef(null);
    const musicRef = useRef(null);
    const stateTimestamps = useRef([]);
    const [eyeState, setEyeState] = useState("open");
    const lastStateRef = useRef("open");
    const timerRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        const socket = io("http://localhost:5000");

        socket.on("eye_state", ({ status }) => {
            const now = Date.now();
            setEyeState(status);
            if (lastStateRef.current !== status) {
                stateTimestamps.current.push({ state: status, time: now });
                lastStateRef.current = status;
            }
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        const checkCompliance = (expectedState, startTime) => {
            const now = Date.now();
            const events = stateTimestamps.current.filter(s => s.time >= startTime && s.time <= now);
            let duration = 0;
            let current = lastStateRef.current;
            let prevTime = startTime;

            for (const event of events) {
                if (current === expectedState) {
                    duration += event.time - prevTime;
                }
                current = event.state;
                prevTime = event.time;
            }
            if (current === expectedState) {
                duration += now - prevTime;
            }

            return duration >= 1000;
        };

        const toggleMusic = () => {
            const newPlayState = !isPlaying;
            setIsPlaying(newPlayState);

            const startTime = Date.now();
            const expectedState = newPlayState ? "closed" : "open";

            if (newPlayState) musicRef.current.play();
            else musicRef.current.pause();

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            setTimeout(() => {
                const ok = checkCompliance(expectedState, startTime);
                if (!ok) {
                    ctx.fillStyle = "red";
                    ctx.font = "24px Arial";
                    ctx.fillText("❌ 状态不匹配！", 50, 100);
                } else {
                    ctx.fillStyle = "lightgreen";
                    ctx.font = "24px Arial";
                    ctx.fillText("✅ 状态正确", 50, 100);
                }
                setTimeout(() => ctx.clearRect(0, 0, canvas.width, canvas.height), 1000);
                timerRef.current = setTimeout(toggleMusic, 5000 + Math.random() * 3000);
            }, 3000);
        };

        timerRef.current = setTimeout(toggleMusic, 2000);
        return () => clearTimeout(timerRef.current);
    }, [isPlaying]);

    return (
        <>
            <canvas
                ref={canvasRef}
                width="640"
                height="480"
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            />
            <audio ref={musicRef} src="/sounds/陶喆-天天.mp3" preload="auto" loop />
        </>
    );
};

export default MusicMode;
