/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
import { useEffect, useState, useRef } from "react";
import styles from "./DifferenceTask.module.css";
import BlinkDetector from "./BlinkDetector";

const STORAGE_KEY = "usedDifferencePairs";
const TASK_TIME = 120;

// 从 localStorage 获取已使用图对 ID 数组
const getUsedPairsFromStorage = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
};

// 存储新的已使用图对 ID
const updateUsedPairsInStorage = (usedIds) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usedIds));
};

const generateImagePairs = () => {
    const pairs = [];
    for (let i = 1; i <= 12; i++) {
        // 改为12组图片
        pairs.push({
            id: i,
            imageA: `/Eye-based-Game/fd/${i}_1.jpg`,
            imageB: `/Eye-based-Game/fd/${i}_2.jpg`,
        });
    }
    return pairs;
};

const DifferenceTask = ({ onComplete, gameId }) => {
    const [timeLeft, setTimeLeft] = useState(120);
    const [currentPair, setCurrentPair] = useState(null);
    const [foundDifferences, setFoundDifferences] = useState([]);
    const [usedPairs, setUsedPairs] = useState([]); // 记录已使用的图片对
    const timerRef = useRef(null);
    const taskIdRef = useRef(gameId);
    // const endBlinkDetectRef = useRef(false);

    // 管理眨眼数据
    const blinkDataRef = useRef([]);
    const hasEndedRef = useRef(false);
    const [detectionActive, setDetectionActive] = useState(false);
    const [shouldEnd, setShouldEnd] = useState(false);

    useEffect(() => {
        selectRandomPair();
        startTimer(TASK_TIME);

        const detectionTimer = setTimeout(() => {
            setDetectionActive(true);
        }, 100);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    // 选择随机图片对
    const selectRandomPair = () => {
        const allPairs = generateImagePairs(); // 12 张图对
        let used = getUsedPairsFromStorage(); // 从 localStorage 获取

        let availablePairs = allPairs.filter((pair) => !used.includes(pair.id));

        // 所有用完时重置
        if (availablePairs.length === 0) {
            used = [];
            availablePairs = [...allPairs];
        }

        const randomIndex = Math.floor(Math.random() * availablePairs.length);
        const selectedPair = availablePairs[randomIndex];

        const updatedUsed = [...used, selectedPair.id];
        updateUsedPairsInStorage(updatedUsed); // 写入 localStorage

        setCurrentPair(selectedPair);
    };

    // 开始倒计时
    const startTimer = (seconds) => {
        setTimeLeft(seconds);
        if (timerRef.current) clearInterval(timerRef.current);

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    endTask();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    // 处理图片点击
    const handleImageClick = (e, isImageA) => {
        const rect = e.target.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width).toFixed(2);
        const y = ((e.clientY - rect.top) / rect.height).toFixed(2);

        setFoundDifferences((prev) => [...prev, { x, y, isImageA }]);
    };

    // 结束任务
    const endTask = () => {
        if (hasEndedRef.current) return; // 避免多次调用
        hasEndedRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
        // 1. 结束眨眼检测
        setShouldEnd(true);

        // 2. 延迟调用 onComplete 以确保眨眼数据已s收集
        const completeTimer = setTimeout(() => {
            console.log("blinkdataRef", blinkDataRef.current);

            onComplete(gameId, blinkDataRef.current);

            // 重置检测状态
            setDetectionActive(false);
            setShouldEnd(false);
            blinkDataRef.current = [];
        }, 500);

        return () => clearTimeout(completeTimer);
    };

    const handleBlinkData = (data) => {
        console.log("taskdata", data);
        blinkDataRef.current = data;
    };

    return (
        <div className={styles.container}>
            {detectionActive && (
                <BlinkDetector onData={handleBlinkData} shouldEnd={shouldEnd} />
            )}
            <h2>找不同任务</h2>
            <div className={styles.timer}>{timeLeft}秒</div>

            {currentPair && (
                <div className={styles.imagePairContainer}>
                    <div className={styles.imageWrapper}>
                        <img
                            src={currentPair.imageA}
                            alt="图片A"
                            onClick={(e) => handleImageClick(e, true)}
                        />
                        {foundDifferences
                            .filter((diff) => diff.isImageA)
                            .map((diff, index) => (
                                <div
                                    key={index}
                                    className={styles.differenceMarker}
                                    style={{
                                        left: `${diff.x * 100}%`,
                                        top: `${diff.y * 100}%`,
                                    }}
                                />
                            ))}
                    </div>

                    <div className={styles.imageWrapper}>
                        <img
                            src={currentPair.imageB}
                            alt="图片B"
                            onClick={(e) => handleImageClick(e, false)}
                        />
                        {foundDifferences
                            .filter((diff) => !diff.isImageA)
                            .map((diff, index) => (
                                <div
                                    key={index}
                                    className={styles.differenceMarker}
                                    style={{
                                        left: `${diff.x * 100}%`,
                                        top: `${diff.y * 100}%`,
                                    }}
                                />
                            ))}
                    </div>
                </div>
            )}

            <div className={styles.gameId}>任务ID: {taskIdRef.current}</div>
        </div>
    );
};

export default DifferenceTask;
