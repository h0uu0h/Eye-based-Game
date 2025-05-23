import PropTypes from "prop-types";
import { useState, useRef, useEffect } from "react";
import { Progress, Flex } from "antd";
import playIcon from "../../src/icon/play.svg";
import pauseIcon from "../../src/icon/pause.svg";
import volumeIcon from "../../src/icon/volume.svg";
import styles from "./Music.module.css";

const MusicControl = ({ audioSrc }) => {
    // 音频引用
    const audioRef = useRef(null);
    const volumeControlRef = useRef(null);

    // 状态管理
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.7);
    const [showVolumeControl, setShowVolumeControl] = useState(false);

    // 计算进度百分比
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    // 处理播放/暂停
    const togglePlayPause = () => {
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    // 处理进度条点击
    const handleProgressClick = (e) => {
        if (!audioRef.current) return;

        const progressBar = e.currentTarget;
        const clickPosition =
            e.clientX - progressBar.getBoundingClientRect().left;
        const progressBarWidth = progressBar.clientWidth;
        const seekPercentage = clickPosition / progressBarWidth;
        const seekTime = seekPercentage * duration;

        audioRef.current.currentTime = seekTime;
        setCurrentTime(seekTime);
    };

    // 处理音量变化
    const handleVolumeChange = (e) => {
        const newVolume = e.target.value / 100;
        setVolume(newVolume);
        audioRef.current.volume = newVolume;

        // 更新CSS变量
        e.target.style.setProperty("--progress", `${e.target.value}%`);
    };

    // 切换音量控制显示
    const toggleVolumeControl = () => {
        setShowVolumeControl(!showVolumeControl);
    };

    // 点击外部关闭音量控制
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                volumeControlRef.current &&
                !volumeControlRef.current.contains(event.target)
            ) {
                setShowVolumeControl(false);
            }
        };

        if (showVolumeControl) {
            document.addEventListener("mousedown", handleClickOutside);
        }

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showVolumeControl]);

    // 更新当前时间和进度
    useEffect(() => {
        const audio = audioRef.current;

        const updateTime = () => {
            setCurrentTime(audio.currentTime);
        };

        const updateDuration = () => {
            setDuration(audio.duration);
        };

        audio.addEventListener("timeupdate", updateTime);
        audio.addEventListener("loadedmetadata", updateDuration);
        audio.addEventListener("ended", () => setIsPlaying(false));

        // 设置初始音量
        audio.volume = volume;

        return () => {
            audio.removeEventListener("timeupdate", updateTime);
            audio.removeEventListener("loadedmetadata", updateDuration);
            audio.removeEventListener("ended", () => setIsPlaying(false));
        };
    }, [volume]);

    return (
        <>
            {/* 隐藏的音频元素 */}
            <audio ref={audioRef} src={audioSrc} preload="metadata" />

            <Flex
                align="center"
                gap={16}
                style={{ flex: 1, maxWidth: 600, padding: "0 24px" }}>
                {/* 播放/暂停按钮 */}
                <button className={styles.playButton} onClick={togglePlayPause}>
                    <img
                        width="100%"
                        height="100%"
                        src={isPlaying ? pauseIcon : playIcon}
                        alt={isPlaying ? "Pause" : "Play"}
                    />
                </button>

                {/* 进度条 */}
                <div
                    style={{ flex: 1, cursor: "pointer" }}
                    onClick={handleProgressClick}>
                    <Progress
                        percent={progress}
                        showInfo={false}
                        strokeColor="#fff"
                        trailColor="#555"
                    />
                </div>

                {/* 音量图标和音量控制 */}
                <div style={{ position: "relative" }} ref={volumeControlRef}>
                    <button
                        className={styles.volumeButton}
                        onClick={toggleVolumeControl}>
                        <img
                            width="100%"
                            height="100%"
                            src={volumeIcon}
                            alt="Volume"
                        />
                    </button>

                    {/* 音量滑块 - 只在showVolumeControl为true时显示 */}
                    {showVolumeControl && (
                        <div
                            style={{
                                position: "absolute",
                                display: "Flex",
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: "#000",
                                padding: "10px",
                                borderRadius: "4px",
                                boxShadow:
                                    "0 2px 8px rgba(255, 255, 255, 0.06)",
                                zIndex: 10,
                            }}>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume * 100}
                                onChange={handleVolumeChange}
                                style={{
                                    // 基础样式
                                    width: "100px",
                                    height: "6px",
                                    WebkitAppearance: "none", // 清除默认样式
                                    outline: "none", // 移除焦点轮廓
                                    cursor: "pointer",
                                    "--progress": `${volume * 100}%`,
                                }}
                                // 添加CSS类名以便在CSS模块中定义样式
                                className={styles.volumeSlider}
                            />
                        </div>
                    )}
                </div>
            </Flex>
        </>
    );
};

// 添加 PropTypes 验证
MusicControl.propTypes = {
    audioSrc: PropTypes.string.isRequired,
};

export default MusicControl;
