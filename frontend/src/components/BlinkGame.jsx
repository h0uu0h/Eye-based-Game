import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const BlinkGame = () => {
    const canvasRef = useRef(null);
    const [blinkCount, setBlinkCount] = useState(0);

    useEffect(() => {
        const socket = io("http://localhost:5000");
        socket.on("blink_event", (data) => {
            setBlinkCount(data.total);

            // 在canvas上绘制反馈
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.font = "30px Arial";
            ctx.fillStyle = "red";
            ctx.fillText("Blink!", 50, 50);

            // 消失效果
            setTimeout(() => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }, 500);
        });

        return () => socket.disconnect();
    }, []);

    return (
        <div style={{ position: "relative", width: "640px", height: "480px" }}>
            <img
                src="http://localhost:5000/video_feed"
                alt="Video Stream"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
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
            <div
                style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    color: "white",
                    fontSize: "20px",
                }}>
                Total Blinks: {blinkCount}
            </div>
        </div>
    );
};

export default BlinkGame;
