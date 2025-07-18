/* eslint-disable react/prop-types */
const GameSummary = ({ data, onClose }) => {
    if (!data) return null;

    const renderSummary = () => {
        const { mode } = data;
        if (mode === "classic") {
            const total = data.score + data.missCount;
            return (
                <>
                    <p>模式：经典模式</p>
                    <p>成功眨眼次数：{data.score}</p>
                    <p>总眨眼尝试：{total}</p>
                    <p>成功率：{(data.successRate * 100).toFixed(2)}%</p>
                </>
            );
        }

        if (mode === "command") {
            return (
                <>
                    <p>模式：指令模式</p>
                    <p>成功指令次数：{data.commandSuccess}</p>
                    <p>总指令次数：{data.commandTotal}</p>
                    <p>成功率：{(data.successRate * 100).toFixed(2)}%</p>
                </>
            );
        }

        // 在renderSummary函数中添加jump模式的结算
        if (mode === "jump") {
            return (
                <>
                    <p>模式：踩云朵冒险</p>
                    <p>尝试次数：{data.totalJumps}</p>
                    <p>成功跳跃：{data.successfulJumps}</p>
                    <p>总高度：{data.totalHeight.toFixed(1)}米</p>
                    {data.achievement && <p>🎖️ 成就：{data.achievement}</p>}
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

            <p>
                历史排名：{data.rank} / {data.totalGames}
            </p>
            <p>该模式游戏总次数：{data.totalGames}</p>

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
                关闭
            </button>
        </div>
    );
};

export default GameSummary;
