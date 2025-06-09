/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import blinkSound from "/sounds/blink.wav";
import missSound from "/sounds/miss.wav";
import blink1Sound from "/sounds/cmd_blink1.mp3";
import blink2Sound from "/sounds/cmd_blink2.mp3";
import closeSound from "/sounds/cmd_close.mp3";
import openSound from "/sounds/cmd_open.mp3";
import SegmentedProgress from "./SegmentedProgress";

const COMMANDS = [
    { text: "眨一次", type: "blink", count: 1, audio: blink1Sound },
    { text: "眨两次", type: "blink", count: 2, audio: blink2Sound },
    { text: "闭眼", type: "state", target: "closed", audio: closeSound },
    { text: "睁眼", type: "state", target: "open", audio: openSound },
];

const CommandMode = ({ onGameEnd, totalTasks = 15 }) => {
    const missAudioRef = useRef(null);
    const successAudioRef = useRef(null);
    const commandAudioRef = useRef(null);

    const [eyeState, setEyeState] = useState("open");
    const [currentTask, setCurrentTask] = useState(0);
    const [progress, setProgress] = useState(0);
    const [taskStatus, setTaskStatus] = useState("");
    const [currentTaskInfo, setCurrentTaskInfo] = useState(COMMANDS[0]);
    const [taskResults, setTaskResults] = useState([]);
    const [taskSequence, setTaskSequence] = useState([]);

    const taskTotalRef = useRef(0);
    const taskSuccessRef = useRef(0);
    const timerRef = useRef(null);
    const blinkTimestamps = useRef([]);
    const stateTimestamps = useRef([]);

    // 任务规则
    const generateRandomTasks = () => {
        const tasks = [];
        let lastTaskType = null;

        for (let i = 0; i < totalTasks; i++) {
            let availableCommands = [...COMMANDS];

            // 规则1: 睁眼任务只有在前一个是闭眼任务时才可能出现
            if (lastTaskType !== "closed") {
                availableCommands = availableCommands.filter(
                    (cmd) => !(cmd.type === "state" && cmd.target === "open")
                );
            }

            // 规则2: 避免连续的睁眼任务
            if (lastTaskType === "open") {
                availableCommands = availableCommands.filter(
                    (cmd) => !(cmd.type === "state" && cmd.target === "open")
                );
            }

            // 规则3: 闭眼任务后不接眨眼任务
            if (lastTaskType === "closed") {
                availableCommands = availableCommands.filter(
                    (cmd) => cmd.type !== "blink"
                );
            }

            // 随机选择一个符合条件的命令
            const randomIndex = Math.floor(
                Math.random() * availableCommands.length
            );
            const selectedCommand = availableCommands[randomIndex];
            tasks.push(selectedCommand);

            // 更新最后任务类型
            lastTaskType =
                selectedCommand.type === "state"
                    ? selectedCommand.target
                    : "blink";
        }

        return tasks;
    };
    // 初始化任务序列
    useEffect(() => {
        setTaskSequence(generateRandomTasks());
    }, [totalTasks]);

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

    useEffect(() => {
        let active = true;
        const TOTAL_TIME = 5000;

        const triggerCommand = () => {
            if (
                !active ||
                currentTask >= totalTasks ||
                taskSequence.length === 0
            )
                return;

            const currentCommand = taskSequence[currentTask];
            setCurrentTaskInfo(currentCommand);
            taskTotalRef.current += 1;
            setTaskStatus("");

            // 播放任务提示音
            if (commandAudioRef.current) {
                commandAudioRef.current.src = currentCommand.audio;
                commandAudioRef.current.play().catch(() => {});
            }

            const startTime = Date.now();
            const initialState = { state: eyeState, time: startTime };
            let taskCompleted = false;

            const checkCompletion = () => {
                if (taskCompleted) return;

                let success = false;
                const now = Date.now();

                // 判断是否眨眼成功
                if (currentCommand.type === "blink") {
                    const recentBlinks = blinkTimestamps.current.filter(
                        (t) => t >= startTime && t <= now
                    );
                    success = recentBlinks.length >= currentCommand.count;

                    // 如果是眨眼任务且已完成，立即标记为完成
                    if (success) {
                        taskCompleted = true;
                        completeTask(success);
                        return;
                    }
                }
                // 判断是否持续达到状态
                else if (currentCommand.type === "state") {
                    const events = [
                        initialState,
                        ...stateTimestamps.current.filter(
                            (s) => s.time >= startTime && s.time <= now
                        ),
                    ].sort((a, b) => a.time - b.time);

                    let duration = 0;
                    let curr = eyeState;
                    let prevTime = startTime;

                    for (const event of events) {
                        if (curr === currentCommand.target) {
                            duration += event.time - prevTime;
                        }
                        curr = event.state;
                        prevTime = event.time;
                    }

                    if (curr === currentCommand.target) {
                        duration += now - prevTime;
                    }

                    success = duration >= 3000;

                    // 状态任务需要等待足够时间
                    if (success) {
                        taskCompleted = true;
                        completeTask(success);
                        return;
                    }
                }

                // 检查是否超时
                if (now - startTime >= TOTAL_TIME) {
                    taskCompleted = true;
                    completeTask(false);
                }
            };

            const completeTask = (success) => {
                setTaskResults((prev) => [
                    ...prev,
                    success ? "Success!" : "Miss!",
                ]);
                if (success) {
                    taskSuccessRef.current += 1;
                    successAudioRef.current?.play();
                    setTaskStatus("Success!");
                } else {
                    missAudioRef.current?.play();
                    setTaskStatus("Miss!");
                }

                // 更新进度为100%
                setProgress(1);

                // 任务完成后延时1秒开始下一个任务
                setTimeout(() => {
                    setCurrentTask(currentTask + 1);
                    setProgress(0);
                    setTaskStatus("");
                }, 1000);
            };

            const interval = setInterval(() => {
                if (!active || taskCompleted) {
                    clearInterval(interval);
                    return;
                }

                const now = Date.now();
                const elapsedTime = now - startTime;
                const progress = Math.min(elapsedTime / TOTAL_TIME, 1);
                setProgress(progress);

                checkCompletion();
            }, 50);

            return () => clearInterval(interval);
        };

        if (active && currentTask < totalTasks) {
            timerRef.current = setTimeout(triggerCommand, 1000);
        }

        return () => {
            active = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [currentTask, totalTasks, taskSequence]);

    // 💾 结算 & 保存
    useEffect(() => {
        return () => {
            if (!onGameEnd) return;

            const total = taskTotalRef.current;
            const success = taskSuccessRef.current;
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
            <SegmentedProgress
                currentTask={currentTask}
                totalTasks={totalTasks}
                taskInfo={currentTaskInfo}
                taskStatus={taskStatus}
                progress={progress}
                taskResults={taskResults}
            />
            <audio ref={commandAudioRef} preload="auto" />
            <audio ref={missAudioRef} src={missSound} preload="auto" />
            <audio ref={successAudioRef} src={blinkSound} preload="auto" />
        </>
    );
};

export default CommandMode;
