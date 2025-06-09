/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import blinkSound from "/sounds/blink.wav";
import startSound from "/sounds/start.wav";
import missSound from "/sounds/miss.wav";
import ProgressCircle from "./ProgressCircle";

// 经典模式组件
const ClassicMode = ({ onGameEnd }) => {
    const audioRef = useRef(null); // 眨眼音效
    const startAudioRef = useRef(null); // 任务开始提示音
    const missAudioRef = useRef(null); // 错误提示音
    const [message, setMessage] = useState(""); // 当前文字提示
    const [messageColor, setMessageColor] = useState("white"); // 提示文字颜色

    const taskSucceededRef = useRef(false); // 当前任务是否成功完成
    const taskActiveRef = useRef(false); // 当前是否正在执行任务

    const [score, setScore] = useState(0); // 成功得分（UI 显示）
    const scoreRef = useRef(0); // 成功得分（逻辑引用，避免闭包）

    const [missCount, setMissCount] = useState(0); // 错误次数（UI 显示）
    const missRef = useRef(0); // 错误次数（逻辑引用）

    const [blinkCount, setBlinkCount] = useState(0); // 总眨眼次数
    const blinkRef = useRef(0);

    const [progress, setProgress] = useState(0);

    // 🔄 建立 socket 监听眨眼事件
    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL, {
            transports: ["websocket"],
            reconnectionAttempts: 3,
            autoConnect: true,
        });

        // 当服务器检测到眨眼事件
        socket.on("blink_event", (data) => {
            setBlinkCount(data.total);
            blinkRef.current = data.total;


            // 显示 Blink!
            setMessage("Blink!");
            setMessageColor("cyan");
            setTimeout(() => setMessage(""), 500);

            // 播放眨眼音效
            if (audioRef.current) audioRef.current.play();

            // 如果当前任务有效，判定为成功
            if (taskActiveRef.current) {
                setScore((prev) => {
                    const next = prev + 1;
                    scoreRef.current = next;
                    return next;
                });
                taskSucceededRef.current = true;
            }
        });

        return () => socket.disconnect(); // 清理连接
    }, []);

    // 📦 游戏结束时保存历史记录和统计
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
                mode: "classic",
                timestamp: Date.now(),
                score,
                missCount,
                successRate,
            };
            history.push(gameData);
            localStorage.setItem("blinkGameHistory", JSON.stringify(history));

            // 计算当前排名
            const rates = history
                .filter((g) => g.mode === "classic")
                .map((g) => g.successRate)
                .sort((a, b) => b - a);
            const rank = rates.findIndex((r) => r === successRate) + 1;

            onGameEnd({
                mode: "classic",
                score,
                missCount,
                successRate,
                playCount,
                rank,
                totalGames: rates.length,
            });
        };
    }, []);

    // ⏱️ 控制任务间隔触发眨眼检测
    useEffect(() => {
        let timer;

        const triggerTask = () => {
            taskActiveRef.current = true;
            taskSucceededRef.current = false;

            // 显示“Blink now!” 提示
            setMessage("Blink now!");
            setMessageColor("yellow");

            // 任务开始播放音效
            startAudioRef.current?.play();

            // 给 1 秒时间眨眼
            const TOTAL_TIME = 2000;
            const startTime = Date.now();

            const interval = setInterval(() => {
                const now = Date.now();
                const elapsed = now - startTime;
                const p = Math.min(elapsed / TOTAL_TIME, 1);
                setProgress(p);

                if (p >= 1) {
                    clearInterval(interval);
                    taskActiveRef.current = false;

                    if (!taskSucceededRef.current) {
                        setMissCount((prev) => {
                            const next = prev + 1;
                            missRef.current = next;
                            return next;
                        });
                        missAudioRef.current?.play();

                        setMessage("Miss!");
                        setMessageColor("orange");
                        setTimeout(() => setMessage(""), 800);
                    }

                    setProgress(0); // ✅ 重置进度条
                    timer = setTimeout(
                        triggerTask,
                        3000 + Math.random() * 4000
                    );
                }
            }, 50);
        };

        // 游戏启动后，2~5 秒内触发第一个任务
        timer = setTimeout(triggerTask, 2000 + Math.random() * 3000);

        return () => clearTimeout(timer);
    }, []);

    // 🎨 UI 渲染 + 音效资源 + 数据展示
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
            <div
                style={{
                    position: "absolute",
                    top: "28%",
                    right: "10%",
                    transform: "translate(-50%, -50%)",
                    zIndex: 10,
                }}>
                <ProgressCircle
                    progress={progress}
                    size={80}
                    strokeWidth={10}
                    color="white"
                />
            </div>
            {/* 音效资源 */}
            <audio ref={audioRef} src={blinkSound} preload="auto" />
            <audio ref={startAudioRef} src={startSound} preload="auto" />
            <audio ref={missAudioRef} src={missSound} preload="auto" />

            {/* 总眨眼数 */}
            <div
                style={{
                    position: "absolute",
                    bottom: "10px",
                    left: "10px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                }}>
                <div
                    style={{
                        color: "white",
                        fontSize: "18px",
                        fontWeight: "bold",
                    }}>
                    Total Blinks: {blinkCount}
                </div>

                {/* 得分 */}
                <div
                    style={{
                        color: "white",
                        fontSize: "18px",
                        fontWeight: "bold",
                    }}>
                    Score: {score}
                </div>

                {/* 错误次数 */}
                <div
                    style={{
                        color: "white",
                        fontSize: "18px",
                        fontWeight: "bold",
                    }}>
                    Misses: {missCount}
                </div>
            </div>
        </>
    );
};

export default ClassicMode;
