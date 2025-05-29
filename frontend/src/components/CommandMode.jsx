import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import blinkSound from "/sounds/blink.wav";
import missSound from "/sounds/miss.wav";
import blink1Sound from "/sounds/cmd_blink1.mp3";
import blink2Sound from "/sounds/cmd_blink2.mp3";
import closeSound from"/sounds/cmd_close.mp3";
import openSound from "/sounds/cmd_open.mp3";

const COMMANDS = [
    {
        text: "眨一次",
        type: "blink",
        count: 1,
        audio: blink1Sound,
    },
    {
        text: "眨两次",
        type: "blink",
        count: 2,
        audio: blink2Sound,
    },
    {
        text: "闭眼",
        type: "state",
        target: "closed",
        audio: closeSound,
    },
    {
        text: "睁眼",
        type: "state",
        target: "open",
        audio: openSound,
    },
];

const CommandMode = () => {
    const canvasRef = useRef(null);
    const missAudioRef = useRef(null);
    const successAudioRef = useRef(null);
    const commandAudioRef = useRef(null);

    const [, setCurrentCommand] = useState(null);
    const [eyeState, setEyeState] = useState("open");
    const blinkTimestamps = useRef([]);
    const stateTimestamps = useRef([]);
    const timerRef = useRef(null);

    useEffect(() => {
        const socket = io(import.meta.env.VITE_SOCKET_URL);

        socket.on("blink_event", () => {
            const now = Date.now();
            // 保留最近10秒内的眨眼记录
            blinkTimestamps.current = blinkTimestamps.current.filter(
                (t) => now - t <= 10000
            );
            blinkTimestamps.current.push(now);
            console.log("收到 blink_event @", now);
        });

        socket.on("eye_state", ({ status }) => {
            const now = Date.now();
            setEyeState(status);
            // 保留最近30秒内的状态记录
            stateTimestamps.current = stateTimestamps.current.filter(
                (s) => now - s.time <= 30000
            );
            stateTimestamps.current.push({ state: status, time: now });
            console.log("眼睛状态:", status, now);
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        const triggerCommand = () => {
            // 清除旧定时器
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }

            let filteredCommands = COMMANDS.filter((cmd) => {
                if (eyeState === "closed") {
                    return cmd.type === "state" && cmd.target === "open";
                }
                return true;
            });

            const command =
                filteredCommands[
                    Math.floor(Math.random() * filteredCommands.length)
                ];
            setCurrentCommand(command);
            console.log("新的指令:", command);

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "30px Arial";
            ctx.fillStyle = "yellow";
            ctx.fillText(command.text, 50, 50);

            if (commandAudioRef.current) {
                commandAudioRef.current.src = command.audio;
                commandAudioRef.current
                    .play()
                    .catch((e) => console.error("音频播放失败:", e));
            }

            const startTime = Date.now();
            const startState = eyeState; // 记录初始状态
            const initialState = {
                state: startState,
                time: startTime,
            };

            setTimeout(() => {
                let success = false;
                const now = Date.now();

                if (command.type === "blink") {
                    const recentBlinks = blinkTimestamps.current.filter(
                        (t) => t >= startTime && t <= now
                    );
                    success = recentBlinks.length >= command.count;
                    console.log("任务期间眨眼次数:", recentBlinks.length);
                } else if (command.type === "state") {
                    // 获取时间段内的所有状态事件并按时间排序
                    const events = [
                        initialState,
                        ...stateTimestamps.current
                            .filter((s) => s.time >= startTime && s.time <= now)
                            .sort((a, b) => a.time - b.time),
                    ];

                    let duration = 0;
                    let currentState = startState;
                    let prevTime = startTime;

                    // 计算每个时间段的状态持续时间
                    for (const event of events) {
                        if (currentState === command.target) {
                            duration += event.time - prevTime;
                        }
                        currentState = event.state;
                        prevTime = event.time;
                    }

                    // 处理最后一段到now的时间
                    if (currentState === command.target) {
                        duration += now - prevTime;
                    }

                    success = duration >= 1000; // 至少1秒
                    console.log(
                        "任务期间",
                        command.target,
                        "累计时长:",
                        duration
                    );
                }

                // 显示结果
                if (!success) {
                    missAudioRef.current
                        ?.play()
                        .catch((e) => console.error("Miss音频失败:", e));
                    ctx.fillStyle = "orange";
                    ctx.fillText("Miss!", 50, 100);
                } else {
                    successAudioRef.current
                        ?.play()
                        .catch((e) => console.error("Success音频失败:", e));
                    ctx.fillStyle = "lightgreen";
                    ctx.fillText("Success!", 50, 100);
                }

                // 1秒后清除结果
                setTimeout(
                    () => ctx.clearRect(0, 0, canvas.width, canvas.height),
                    1000
                );

                // 设置下一个指令的延迟
                const nextDelay = 4000 + Math.random() * 3000;
                timerRef.current = setTimeout(triggerCommand, nextDelay);
            }, 3000);
        };

        // 初始延迟
        const initialDelay = 3000 + Math.random() * 3000;
        timerRef.current = setTimeout(triggerCommand, initialDelay);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [eyeState]);

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
            <audio
                ref={successAudioRef}
                src={blinkSound}
                preload="auto"
            />
        </>
    );
};

export default CommandMode;
