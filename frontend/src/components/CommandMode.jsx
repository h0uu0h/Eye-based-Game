/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import blinkSound from "/sounds/blink.wav";
import missSound from "/sounds/miss.wav";
import blink1Sound from "/sounds/cmd_blink1.mp3";
import blink2Sound from "/sounds/cmd_blink2.mp3";
import closeSound from "/sounds/cmd_close.mp3";
import openSound from "/sounds/cmd_open.mp3";

const COMMANDS = [
    { text: "眨一次", type: "blink", count: 1, audio: blink1Sound },
    { text: "眨两次", type: "blink", count: 2, audio: blink2Sound },
    { text: "闭眼", type: "state", target: "closed", audio: closeSound },
    { text: "睁眼", type: "state", target: "open", audio: openSound },
];

const CommandMode = ({ onGameEnd }) => {
    const canvasRef = useRef(null);
    const missAudioRef = useRef(null);
    const successAudioRef = useRef(null);
    const commandAudioRef = useRef(null);

    const [eyeState, setEyeState] = useState("open");
    const blinkTimestamps = useRef([]);
    const stateTimestamps = useRef([]);
    const timerRef = useRef(null);

    const commandTotalRef = useRef(0);
    const commandSuccessRef = useRef(0);

    // 👁️ 监听眼睛事件
    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on("blink_event", () => {
            const now = Date.now();
            blinkTimestamps.current = blinkTimestamps.current.filter(
                (t) => now - t <= 10000
            );
            blinkTimestamps.current.push(now);
        });

        socket.on("eye_state", ({ status }) => {
            const now = Date.now();
            setEyeState(status);
            stateTimestamps.current = stateTimestamps.current
                .filter((s) => now - s.time <= 30000)
                .concat({ state: status, time: now });
        });

        return () => socket.disconnect();
    }, []);

    // 🧠 执行指令任务
    useEffect(() => {
        let active = true;

        const triggerCommand = () => {
            if (!active) return;

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");

            const filteredCommands =
                eyeState === "closed"
                    ? COMMANDS.filter(
                          (c) => c.type === "state" && c.target === "open"
                      )
                    : COMMANDS;

            const command =
                filteredCommands[
                    Math.floor(Math.random() * filteredCommands.length)
                ];

            commandTotalRef.current += 1;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "30px Arial";
            ctx.fillStyle = "yellow";
            ctx.fillText(command.text, 50, 50);

            if (commandAudioRef.current) {
                commandAudioRef.current.src = command.audio;
                commandAudioRef.current.play().catch(() => {});
            }

            const startTime = Date.now();
            const startState = eyeState;
            const initialState = { state: startState, time: startTime };

            setTimeout(() => {
                const now = Date.now();
                let success = false;

                if (command.type === "blink") {
                    const recentBlinks = blinkTimestamps.current.filter(
                        (t) => t >= startTime && t <= now
                    );
                    success = recentBlinks.length >= command.count;
                } else if (command.type === "state") {
                    const events = [
                        initialState,
                        ...stateTimestamps.current.filter(
                            (s) => s.time >= startTime && s.time <= now
                        ),
                    ];
                    events.sort((a, b) => a.time - b.time);

                    let duration = 0;
                    let curr = startState;
                    let prevTime = startTime;

                    for (const event of events) {
                        if (curr === command.target) {
                            duration += event.time - prevTime;
                        }
                        curr = event.state;
                        prevTime = event.time;
                    }

                    if (curr === command.target) {
                        duration += now - prevTime;
                    }

                    success = duration >= 1000;
                }

                // 播放反馈音
                if (success) {
                    commandSuccessRef.current += 1;
                    ctx.fillStyle = "lightgreen";
                    successAudioRef.current?.play();
                    ctx.fillText("Success!", 50, 100);
                } else {
                    ctx.fillStyle = "orange";
                    missAudioRef.current?.play();
                    ctx.fillText("Miss!", 50, 100);
                }

                setTimeout(
                    () => ctx.clearRect(0, 0, canvas.width, canvas.height),
                    1000
                );

                // 继续下一轮
                if (active) {
                    timerRef.current = setTimeout(
                        triggerCommand,
                        4000 + Math.random() * 3000
                    );
                }
            }, 3000);
        };

        timerRef.current = setTimeout(
            triggerCommand,
            3000 + Math.random() * 3000
        );

        return () => {
            active = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [eyeState]);

    // 💾 结算 & 保存
    useEffect(() => {
        return () => {
            if (!onGameEnd) return;

            const total = commandTotalRef.current;
            const success = commandSuccessRef.current;
            if (total === 0) return;

            const successRate = success / total;

            const playCount =
                parseInt(localStorage.getItem("playCount") || "0", 10) + 1;
            localStorage.setItem("playCount", playCount);

            const history = JSON.parse(
                localStorage.getItem("blinkGameHistory") || "[]"
            );
            const gameData = {
                timestamp: Date.now(),
                mode: "command",
                commandTotal: total,
                commandSuccess: success,
                successRate,
            };
            history.push(gameData);
            localStorage.setItem("blinkGameHistory", JSON.stringify(history));

            const rates = history
                .filter((g) => g.mode === "command")
                .map((g) => g.successRate)
                .sort((a, b) => b - a);
            const rank = rates.findIndex((r) => r === successRate) + 1;

            onGameEnd({
                mode: "command",
                commandTotal: total,
                commandSuccess: success,
                successRate,
                playCount,
                rank,
                totalGames: rates.length,
            });
        };
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
            <audio ref={commandAudioRef} preload="auto" />
            <audio ref={missAudioRef} src={missSound} preload="auto" />
            <audio ref={successAudioRef} src={blinkSound} preload="auto" />
        </>
    );
};

export default CommandMode;
