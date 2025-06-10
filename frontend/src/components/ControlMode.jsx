import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import musicSound from "/sounds/陶喆-天天.mp3";

const ControlMode = () => {
    const musicRef = useRef(null);
    const [eyeState, setEyeState] = useState("open");

    const [message, setMessage] = useState(""); // 当前文字提示
    const [messageColor, setMessageColor] = useState("white"); // 提示文字颜色

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on("eye_state", ({ status }) => {
            setEyeState(status);
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        if (eyeState === "closed" && musicRef.current.paused) {
            musicRef.current.play();
            setMessage("▶ 播放中（闭眼）");
            setMessageColor("cyan");
        } else if (eyeState === "open" && !musicRef.current.paused) {
            musicRef.current.pause();
            setMessage("⏸ 已暂停（睁眼）");
            setMessageColor("orange");
        }
    }, [eyeState]);

    return (
        <>
            <div
                style={{
                    position: "absolute",
                    top: "25%",
                    left: "14%",
                    transform: "translateY(-50%)",
                    color: messageColor,
                    fontSize: "32px",
                    fontWeight: "bold",
                    zIndex: 20,
                    textShadow: "0 0 5px black",
                    transition: "opacity 0.3s",
                    pointerEvents: "none",
                }}>
                {message}
            </div>
            <audio ref={musicRef} src={musicSound} preload="auto" loop />
        </>
    );
};

export default ControlMode;
