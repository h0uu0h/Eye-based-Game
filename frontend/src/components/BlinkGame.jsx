import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const BlinkGame = () => {
    const canvasRef = useRef(null);
    const audioRef = useRef(null); // blink sound
    const startAudioRef = useRef(null); // task prompt sound
    const missAudioRef = useRef(null); // task fail sound

    const taskSucceededRef = useRef(false);
    const [missCount, setMissCount] = useState(0);
    const [streamKey, setStreamKey] = useState(Date.now());

    const [blinkCount, setBlinkCount] = useState(0);
    const [score, setScore] = useState(0);
    const [taskActive, setTaskActive] = useState(false);
    // 阈值计算
    const [calibrated, setCalibrated] = useState(false);
    const [threshold, setThreshold] = useState(null);

    const handleVideoLoad = () => {
        console.log("Video loaded, starting calibration...");
        fetch("http://localhost:5000/start_calibration", {
            method: "POST",
        });
    };
    useEffect(() => {
        const socket = io("http://localhost:5000", {
            transports: ["websocket"], // 强制使用 WebSocket
            reconnectionAttempts: 3, // 减少重连尝试
            autoConnect: true,
        });
        socket.on("calibrated", (data) => {
            console.log("Calibrated with threshold:", data.threshold);
            setThreshold(data.threshold.toFixed(3));
            setCalibrated(true);
        });
        socket.on("blink_event", (data) => {
            console.log("Received blink event:", data); // 👈 添加调试日志
            setBlinkCount(data.total);

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "30px Arial";
            ctx.fillStyle = "red";
            ctx.fillText("Blink!", 50, 50);

            // 播放音效
            if (audioRef.current) {
                audioRef.current.play();
            }

            if (taskActive) {
                setScore((prev) => prev + 1);
                taskSucceededRef.current = true;
            }

            setTimeout(() => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }, 500);
        });

        return () => socket.disconnect();
    }, [taskActive]);

    // 随机间隔生成“眨眼任务”
    useEffect(() => {
        let timer;
        const triggerTask = () => {
            setTaskActive(true);
            taskSucceededRef.current = false;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            ctx.font = "24px Arial";
            ctx.fillStyle = "yellow";
            ctx.fillText("Blink now!", 50, 100);

            setTimeout(() => {
                setTaskActive(false);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (!taskSucceededRef.current) {
                    setMissCount((prev) => prev + 1);
                    missAudioRef.current.play();
                    // 显示 Miss!
                    ctx.font = "30px Arial";
                    ctx.fillStyle = "orange";
                    ctx.fillText("Miss!", 50, 80);

                    setTimeout(() => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }, 800);
                }
                // 随机间隔再次触发
                const randomDelay = 3000 + Math.random() * 4000; // 3~7秒
                timer = setTimeout(triggerTask, randomDelay);
            }, 1000); // 任务窗口1秒
            startAudioRef.current.play();
        };

        // 启动第一次任务
        const initialDelay = 2000 + Math.random() * 3000;
        timer = setTimeout(triggerTask, initialDelay);

        return () => {
            clearTimeout(timer);
            setStreamKey(Date.now());
        };
    }, []);

    return (
        <div style={{ position: "relative", width: "640px", height: "480px" }}>
            {!calibrated && (
                <div
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        backgroundColor: "rgba(0,0,0,0.7)",
                        padding: "20px",
                        color: "white",
                        fontSize: "22px",
                        borderRadius: "12px",
                        fontWeight: "bold",
                    }}>
                    请睁眼、闭眼几次进行校准...
                </div>
            )}
            {calibrated && (
                <div
                    style={{
                        position: "absolute",
                        top: "10px",
                        left: "10px",
                        color: "lightgreen",
                        fontSize: "16px",
                    }}>
                    校准完成，阈值：{threshold}
                </div>
            )}
            <img
                onLoad={handleVideoLoad}
                src={`http://localhost:5000/video_feed?key=${streamKey}`}
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
            <audio ref={audioRef} src="/sounds/blink.wav" preload="auto" />
            <audio ref={startAudioRef} src="/sounds/start.wav" preload="auto" />
            <audio ref={missAudioRef} src="/sounds/miss.wav" preload="auto" />
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
        </div>
    );
};

export default BlinkGame;
