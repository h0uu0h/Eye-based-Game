/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from "react";
import MemoryTask from "./MemoryTask";
import DifferenceTask from "./DifferenceTask";
import BlinkGame from "./BlinkGame";
import styles from "./ExperimentManager.module.css";
import deleteIcon from "/icon/delete.svg";
import DataExporter from "./DataExporter";
import quizImg from "/quiz/quiz.png";
import mazeQZ from "/quiz/maze.png";
import diceQZ from "/quiz/dice.png";

const ExperimentManager = () => {
    const [currentStage, setCurrentStage] = useState("setup"); // setup running completed
    const [subjectId, setSubjectId] = useState("");
    const subjectIdRef = useRef(""); // 同步存储 subjectId
    const [isTrialMode, setIsTrialMode] = useState(false);
    const handleTrialMode = () => {
        setIsTrialMode(!isTrialMode);
    };
    const [gameOrder, setGameOrder] = useState([
        { id: "baseline", name: "基线模式" },
        { id: "maze", name: "迷宫模式" },
        { id: "dice", name: "骰子模式" },
    ]);

    const [taskOrders, setTaskOrders] = useState({
        baseline: [
            { id: "difference", name: "找不同" },
            { id: "memory", name: "图片记忆" },
        ],
        maze: [
            { id: "difference", name: "找不同" },
            { id: "memory", name: "图片记忆" },
        ],
        dice: [
            { id: "memory", name: "图片记忆" },
            { id: "difference", name: "找不同" },
        ],
    });

    const [currentGameIndex, setCurrentGameIndex] = useState(0);
    const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
    const [currentRound, setCurrentRound] = useState(1);
    const [experimentData, setExperimentData] = useState([]);
    const experimentIdRef = useRef(null); // 同步存储 experimentId

    // ================ 游戏配置 ================
    const [showConfigPanel, setShowConfigPanel] = useState(false);
    const [gameConfigs, setGameConfigs] = useState({
        dice: {
            closeEyeTime: [1, 2, 3], // 随机闭眼时间 (秒)
            bonusWindowDuration: 2000, // 奖励窗口时间 (毫秒)
            bonusPerBlink: 0.5, // 每次眨眼增加的点数
            switchSequence: ["right", "left"], // 切换骰子顺序
            voiceDelay: 1000, // 语音提示延迟 (毫秒)
            promptTimeout: 1000, // 操作提示超时 (毫秒)
            totalTime: 20000, // 总游戏时间 (毫秒)
            minPoints: 11, // 成功所需的最小点数
        },
        maze: {
            closeEyeTime: [1, 2, 3], // 随机闭眼时间 (秒)
            blinkWindowDuration: 2000, // 眨眼奖励窗口时间 (毫秒)
            timeReward: 500, // 每次奖励时间 (毫秒)
            turnSequence: ["right", "left"], // 转向顺序
            voiceDelay: 1000, // 语音提示延迟 (毫秒)
            promptTimeout: 1000, // 操作提示超时 (毫秒)
            totalTime: 20000, // 总游戏时间 (毫秒)
        },
        baseline: {
            countdownDuration: 20, // 持续时间（秒）
            voiceDelay: 1000, // 语音提示延迟 (毫秒)
        },
    });

    const [taskConfigs, setTaskConfigs] = useState({
        memory: {
            phase1Images: 60, // 阶段一图片数量
            phase2Images: 20, // 阶段二图片数量
            phase1Time: 60, // 阶段一持续时间（秒）
            phase2Time: 30, // 阶段二持续时间（秒）
        },
        difference: {
            taskTime: 90, // 持续时间（秒）
        },
    });
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "c" || e.key === "C") {
                setShowConfigPanel((prev) => !prev);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);
    const handleConfigChange = (type, id, key, value) => {
        const updateConfig = (prevConfigs) => {
            const oldVal = prevConfigs[id][key];

            let parsedValue;

            if (Array.isArray(oldVal)) {
                parsedValue =
                    typeof oldVal[0] === "number"
                        ? value.split(",").map((v) => Number(v.trim()))
                        : value.split(",").map((v) => v.trim());
            } else if (typeof oldVal === "number") {
                parsedValue = Number(value);
            } else {
                parsedValue = value;
            }

            return {
                ...prevConfigs,
                [id]: {
                    ...prevConfigs[id],
                    [key]: parsedValue,
                },
            };
        };

        if (type === "game") {
            setGameConfigs(updateConfig);
        } else {
            setTaskConfigs(updateConfig);
        }
    };

    // ================ 实验方法 ================
    const startExperiment = () => {
        if (!subjectIdRef.current) {
            alert("请输入实验者ID");
            return;
        }

        // 生成实验ID
        const newExperimentId = `exp-${subjectIdRef.current}`;
        experimentIdRef.current = newExperimentId; // 同步更新 ref

        setCurrentStage("running");
        setCurrentGameIndex(0);
        setCurrentTaskIndex(0);
        setCurrentRound(1);
        setExperimentData([]);

        // 保存实验配置到localStorage
        const experimentConfig = {
            experimentId: newExperimentId,
            subjectId: subjectIdRef.current,
            gameOrder: gameOrder.map((g) => g.id),
            taskOrders,
            createdAt: new Date().toISOString(),
            status: "running",
        };
        console.log("start", experimentConfig);
        localStorage.setItem(
            `experiment_${newExperimentId}`,
            JSON.stringify(experimentConfig)
        );
    };

    const handleTaskComplete = (gameId, blinkData = null) => {
        const gameMode = gameOrder[currentGameIndex].id;
        const taskType = taskOrders[gameMode][currentTaskIndex].id;
        //屏幕任务数据格式
        const taskData = {
            type: "task",
            gameMode,
            taskType,
            round: currentRound,
            gameId,
            timestamp: new Date().toISOString(),
            blinkData,
        };

        setExperimentData((prev) => [...prev, taskData]);

        // 保存任务数据到localStorage
        if (experimentIdRef.current) {
            const existingData = JSON.parse(
                localStorage.getItem(`experiment_${experimentIdRef.current}`) ||
                    "{}"
            );
            const sessions = existingData.sessions || [];
            sessions.push(taskData);
            existingData.sessions = sessions;
            localStorage.setItem(
                `experiment_${experimentIdRef.current}`,
                JSON.stringify(existingData)
            );
        }
    };

    const handleBlinkGameComplete = (gameId, blinkData = null) => {
        const gameMode = gameOrder[currentGameIndex].id;
        const taskType = taskOrders[gameMode][currentTaskIndex].id;

        //眨眼游戏数据格式
        const blinkGameData = {
            type: "blink",
            gameMode,
            taskType,
            round: currentRound,
            gameId,
            timestamp: new Date().toISOString(),
            blinkData: blinkData,
        };

        setExperimentData((prev) => [...prev, blinkGameData]);

        // 保存眨眼游戏数据到localStorage
        if (experimentIdRef.current) {
            const existingData = JSON.parse(
                localStorage.getItem(`experiment_${experimentIdRef.current}`) ||
                    "{}"
            );
            const sessions = existingData.sessions || [];
            sessions.push(blinkGameData);
            existingData.sessions = sessions;
            localStorage.setItem(
                `experiment_${experimentIdRef.current}`,
                JSON.stringify(existingData)
            );
        }

        const tasks = taskOrders[gameMode];

        if (currentRound === 1) {
            setCurrentRound(2);
        } else {
            if (currentTaskIndex < tasks.length - 1) {
                setCurrentTaskIndex((prev) => prev + 1);
                setCurrentRound(1);
            } else if (currentGameIndex < gameOrder.length - 1) {
                setCurrentGameIndex((prev) => prev + 1);
                setCurrentTaskIndex(0);
                setCurrentRound(1);
            } else {
                // 实验完成，更新状态
                if (experimentIdRef.current) {
                    const existingData = JSON.parse(
                        localStorage.getItem(
                            `experiment_${experimentIdRef.current}`
                        ) || "{}"
                    );
                    existingData.status = "completed";
                    existingData.completedAt = new Date().toISOString();
                    localStorage.setItem(
                        `experiment_${experimentIdRef.current}`,
                        JSON.stringify(existingData)
                    );
                }
                setCurrentStage("completed");
            }
        }
    };

    const handleReorder = (list, fromIndex, toIndex) => {
        const updated = [...list];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return updated;
    };

    const handleGameDrag = (fromIndex, toIndex) => {
        const updated = handleReorder(gameOrder, fromIndex, toIndex);
        setGameOrder(updated);
    };

    const handleTaskDrag = (gameId, fromIndex, toIndex) => {
        const updatedTasks = handleReorder(
            taskOrders[gameId],
            fromIndex,
            toIndex
        );
        setTaskOrders({ ...taskOrders, [gameId]: updatedTasks });
    };

    useEffect(() => {
        if (currentStage === "completed") {
            // 清除找不同图对记录
            localStorage.removeItem("usedDifferencePairs");
        }
    }, [currentStage]);

    const getProgressText = () => {
        if (currentStage !== "running") return "";
        const game = gameOrder[currentGameIndex];
        const task = taskOrders[game.id][currentTaskIndex];
        return `${game.name} - ${task.name} (第${currentRound}轮)`;
    };

    const DraggableList = ({
        items,
        onDropItem,
        gameId,
        allowCrossGroupDrag = true,
    }) => {
        return items.map((item, index) => (
            <div
                key={item.id}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", index);
                    if (!allowCrossGroupDrag) {
                        e.dataTransfer.setData("game-id", gameId);
                    }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    const fromIndex = parseInt(
                        e.dataTransfer.getData("text"),
                        10
                    );

                    if (!allowCrossGroupDrag) {
                        const fromGameId = e.dataTransfer.getData("game-id");
                        if (fromGameId !== gameId) {
                            alert("拖到别的框里了");
                            return;
                        }
                    }

                    if (fromIndex !== index) {
                        onDropItem(fromIndex, index);
                    }
                }}
                className={styles.draggableItem}>
                <span className={styles.handle}>≡</span> {item.name}
            </div>
        ));
    };

    return (
        <div className={styles.container}>
            {showConfigPanel && (
                <div className={styles.configPanel}>
                    <h3>任务配置</h3>
                    {Object.entries(taskConfigs).map(([taskId, taskConfig]) => (
                        <div key={taskId}>
                            <h4>{taskId}</h4>
                            {Object.entries(taskConfig).map(([key, value]) => (
                                <div key={key}>
                                    <label>{key}:</label>
                                    <input
                                        type={
                                            typeof value === "number"
                                                ? "number"
                                                : "text"
                                        }
                                        value={value}
                                        onChange={(e) =>
                                            handleConfigChange(
                                                "task",
                                                taskId,
                                                key,
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                    <h3>游戏配置</h3>
                    {Object.entries(gameConfigs).map(([gameId, gameConfig]) => (
                        <div key={gameId}>
                            <h4>{gameId}</h4>
                            {Object.entries(gameConfig).map(([key, value]) => (
                                <div key={key}>
                                    <label>{key}:</label>
                                    <input
                                        type={
                                            typeof value === "number"
                                                ? "number"
                                                : "text"
                                        }
                                        value={
                                            Array.isArray(value)
                                                ? value.join(",")
                                                : value
                                        }
                                        onChange={(e) =>
                                            handleConfigChange(
                                                "game",
                                                gameId,
                                                key,
                                                e.target.value
                                            )
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
            {currentStage === "setup" && (
                <button
                    onClick={handleTrialMode}
                    className={styles.trialButton}>
                    {!isTrialMode ? "试玩一下" : "退出试玩"}
                </button>
            )}
            {isTrialMode && <BlinkGame />}
            {currentStage === "setup" && !isTrialMode && (
                <div className={styles.setupContainer}>
                    <DataExporter />
                    <button
                        onClick={() => {
                            if (
                                confirm(
                                    "确定要清除所有实验记录吗？此操作不可撤销。"
                                )
                            ) {
                                // 清除所有实验相关的localStorage数据
                                const keysToRemove = [];

                                for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (
                                        key &&
                                        (key === "blinkGameHistory" ||
                                            key.startsWith("experiment_") ||
                                            key.startsWith("blinkHistory_"))
                                    ) {
                                        keysToRemove.push(key);
                                    }
                                }

                                keysToRemove.forEach((key) => {
                                    localStorage.removeItem(key);
                                });

                                alert(
                                    `已清除 ${keysToRemove.length} 条实验记录！`
                                );
                            }
                        }}
                        className={styles.deleteBtn}>
                        <img
                            src={deleteIcon}
                            style={{
                                width: "24px",
                            }}
                            alt="清除历史"
                        />
                    </button>
                    <div className={styles.mainSettings}>
                        <div className={styles.leftCol}>
                            <h2>实验设置</h2>
                            <div className={styles.inputGroup}>
                                <input
                                    type="text"
                                    value={subjectId}
                                    onChange={(e) => {
                                        setSubjectId(e.target.value);
                                        subjectIdRef.current = e.target.value; // 同步更新 ref
                                    }}
                                    placeholder="ID"
                                />
                            </div>

                            <div className={styles.orderSection}>
                                <h3>眨眼游戏顺序</h3>
                                <DraggableList
                                    items={gameOrder}
                                    onDropItem={handleGameDrag}
                                    allowCrossGroupDrag={true}
                                />
                            </div>
                            <button
                                onClick={startExperiment}
                                className={styles.startButton}
                                disabled={!subjectId}>
                                开始实验
                            </button>
                        </div>
                        <div className={styles.rightCol}>
                            {gameOrder.map((game) => (
                                <div
                                    key={game.id}
                                    className={styles.orderSection}>
                                    <h3>{game.name} 的任务顺序</h3>
                                    <DraggableList
                                        items={taskOrders[game.id]}
                                        gameId={game.id}
                                        allowCrossGroupDrag={false}
                                        onDropItem={(from, to) =>
                                            handleTaskDrag(game.id, from, to)
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {currentStage === "running" && (
                <div className={styles.runningContainer}>
                    <div className={styles.progressBar}>
                        <div className={styles.progressInfo}>
                            <h3>实验进度</h3>
                            <p>{getProgressText()}</p>
                            <p>
                                游戏 {currentGameIndex + 1}/{gameOrder.length} |
                                任务 {currentTaskIndex + 1}/
                                {
                                    taskOrders[gameOrder[currentGameIndex].id]
                                        .length
                                }{" "}
                                | 轮次 {currentRound}/2
                            </p>
                        </div>
                    </div>

                    {(() => {
                        const currentGameId = gameOrder[currentGameIndex].id;
                        const currentTask =
                            taskOrders[currentGameId][currentTaskIndex];
                        const taskGameId = `${subjectIdRef.current}-${currentGameId}-${currentTask.id}-${currentRound}-task`;
                        const blinkGameId = `${subjectIdRef.current}-${currentGameId}-${currentTask.id}-${currentRound}-blink`;

                        // 检查是否应该显示眨眼游戏
                        const shouldShowBlinkGame =
                            experimentData.length > 0 &&
                            experimentData[experimentData.length - 1].type ===
                                "task";

                        if (shouldShowBlinkGame) {
                            return (
                                <BlinkGame
                                    mode={currentGameId}
                                    config={gameConfigs[currentGameId]}
                                    onComplete={handleBlinkGameComplete}
                                    experimentId={experimentIdRef.current}
                                    gameId={blinkGameId}
                                />
                            );
                        }

                        if (currentTask.id === "memory") {
                            return (
                                <MemoryTask
                                    config={taskConfigs.memory}
                                    onComplete={handleTaskComplete}
                                    gameId={taskGameId}
                                />
                            );
                        } else {
                            return (
                                <DifferenceTask
                                    config={taskConfigs.difference}
                                    onComplete={handleTaskComplete}
                                    gameId={taskGameId}
                                />
                            );
                        }
                    })()}
                </div>
            )}

            {currentStage === "completed" && (
                <div className={styles.completedContainer}>
                    <h1>实验完成!</h1>
                    <h2>实验者: {subjectId}</h2>
                    <h2>完成时间: {new Date().toLocaleString()}</h2>
                    <DataExporter
                        experimentData={experimentData}
                        subjectId={subjectId}
                        experimentId={experimentIdRef.current}
                        gameOrder={gameOrder}
                        taskOrders={taskOrders}
                    />
                    <button
                        onClick={() => setCurrentStage("setup")}
                        className={styles.restartButton}
                        style={{ marginLeft: "10px" }}>
                        新的实验
                    </button>
                    <div className={styles.qzContainer}>
                        <div className={styles.qzItem}>
                            <img
                                className={styles.qzImg}
                                src={quizImg}
                                alt="问卷"
                            />
                            <p>问卷</p>
                        </div>
                        {/* <div className={styles.qzItem}>
                            <img
                                className={styles.qzImg}
                                src={mazeQZ}
                                alt="迷宫问卷"
                            />
                            <p>迷宫问卷</p>
                        </div>
                        <div className={styles.qzItem}>
                            <img
                                className={styles.qzImg}
                                src={diceQZ}
                                alt="骰子问卷"
                            />
                            <p>骰子问卷</p>
                        </div> */}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExperimentManager;
