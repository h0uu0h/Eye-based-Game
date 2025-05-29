import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import musicSound from "/sounds/陶喆-天天.mp3";

const ControlMode = () => {
    const canvasRef = useRef(null);
    const musicRef = useRef(null);
    const [eyeState, setEyeState] = useState("open");

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on("eye_state", ({ status }) => {
            setEyeState(status);
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = "24px Arial";

        if (eyeState === "closed" && musicRef.current.paused) {
            musicRef.current.play();
            ctx.fillStyle = "lightgreen";
            ctx.fillText("▶ 播放中（闭眼）", 40, 50);
        } else if (eyeState === "open" && !musicRef.current.paused) {
            musicRef.current.pause();
            ctx.fillStyle = "orange";
            ctx.fillText("⏸ 已暂停（睁眼）", 40, 50);
        }
    }, [eyeState]);

    return (
        <>
            <canvas
                ref={canvasRef}
                width="640"
                height="480"
                style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
            />
            <audio ref={musicRef} src={musicSound} preload="auto" loop />
        </>
    );
};

export default ControlMode;
