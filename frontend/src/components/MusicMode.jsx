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
    const minInterval = 8000; // 最小间隔8秒
    const maxInterval = 15000; // 最大间隔15秒
    const lastToggleTime = useRef(0);

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

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
            const events = stateTimestamps.current.filter(
                (s) => s.time >= startTime && s.time <= now
            );
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
            const now = Date.now();
            if (now - lastToggleTime.current < minInterval) {
                const remainingDelay =
                    minInterval - (now - lastToggleTime.current);
                timerRef.current = setTimeout(toggleMusic, remainingDelay);
                return;
            }

            lastToggleTime.current = now;
            const newPlayState = !isPlaying;
            setIsPlaying(newPlayState);

            const startTime = now;
            const expectedState = newPlayState ? "closed" : "open";

            try {
                if (newPlayState) {
                    musicRef.current.play();
                } else {
                    musicRef.current.pause();
                }
            } catch (e) {
                console.error("音频操作失败:", e);
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = newPlayState ? "lightgreen" : "orange";
            ctx.font = "30px Arial";
            // 修正提示文本
            ctx.fillText(
                newPlayState ? "▶️ 请保持闭眼" : "⏸️ 请保持睁眼",
                50,
                50
            );

            setTimeout(() => {
                const ok = checkCompliance(expectedState, startTime);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = "30px Arial";
                ctx.fillStyle = ok ? "lightgreen" : "red";
                ctx.fillText(ok ? "✅ 完成！" : "❌ 未保持状态", 50, 50);

                const nextDelay =
                    Math.random() * (maxInterval - minInterval) + minInterval;
                timerRef.current = setTimeout(toggleMusic, nextDelay);
            }, 3000);
        };

        timerRef.current = setTimeout(toggleMusic, 2000);

        return () => {
            clearTimeout(timerRef.current);
        };
    }, [isPlaying]);

    return (
        <div style={{ position: "relative", width: "100%", height: "100vh" }}>
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
            <audio
                ref={musicRef}
                src="/sounds/陶喆-天天.mp3"
                preload="auto"
                loop
                onError={(e) => console.error("音频加载失败:", e)}
            />
        </div>
    );
};

export default MusicMode;
