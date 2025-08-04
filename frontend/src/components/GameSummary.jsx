/* eslint-disable react/prop-types */
const GameSummary = ({ data, onClose }) => {
    if (!data) return null;

    const renderSummary = () => {
        const { mode } = data;
        if (mode === "baseline") {
            return (
                <>
                    <p>模式：基线模式</p>
                    <p>放松时间结束</p>
                </>
            );
        }
        if (mode === "dice") {
            // 骰子空间模式
            return (
                <>
                    <p>模式：骰子空间</p>
                    <p>
                        总点数：{data.totalPoints} （目标: {data.minPoints}）
                    </p>
                    <p>骰子点数：{data.dicePoints.join(", ")}</p>
                    <p>
                        眨眼次数：总{data.totalBlinks}次 (左{data.leftBlinks}/右
                        {data.rightBlinks})
                    </p>
                    <p>
                        闭眼时长：{(data.closeEyeDuration / 1000).toFixed(2)}秒
                    </p>
                    <p>错误切换：{data.wrongSwitches}次</p>
                    {data.isSuccess ? (
                        <p>🎉 成功达成目标！</p>
                    ) : (
                        <p>❌ 未达成目标</p>
                    )}
                </>
            );
        }

        if (mode === "maze") {
            // 迷宫救援模式
            return (
                <>
                    <p>模式：迷宫救援</p>
                    <p>
                        用时：
                        {data.finalTime > 0
                            ? `${data.finalTime.toFixed(2)}秒`
                            : "未完成"}{" "}
                        (奖励: -{(data.timeBonus / 1000).toFixed(2)}秒)
                    </p>
                    <p>
                        眨眼次数：总{data.totalBlinks}次 (左{data.leftBlinks}/右
                        {data.rightBlinks})
                    </p>
                    <p>
                        闭眼时长：{(data.closeEyeDuration / 1000).toFixed(2)}秒
                    </p>
                    <p>错误转向：{data.wrongTurns}次</p>
                    {data.isSuccess ? <p>🎉 救援成功！</p> : <p>❌ 救援失败</p>}
                </>
            );
        }
        return <p>未知模式</p>;
    };

    return (
        <div
            style={{
                position: "fixed",
                top: "20%",
                left: "50%",
                transform: "translateX(-50%)",
                background: "#222",
                color: "#fff",
                padding: "20px 30px",
                borderRadius: "12px",
                boxShadow: "0 0 10px rgba(0,0,0,0.5)",
                zIndex: 9999,
                minWidth: "300px",
                fontFamily: "Arial",
            }}>
            <h2 style={{ marginTop: 0 }}>🎮 游戏结算</h2>

            {renderSummary()}

            <button
                onClick={onClose}
                style={{
                    marginTop: "10px",
                    background: "#4CAF50",
                    border: "none",
                    padding: "8px 16px",
                    color: "white",
                    borderRadius: "6px",
                    cursor: "pointer",
                }}>
                下一步
            </button>
        </div>
    );
};

export default GameSummary;
