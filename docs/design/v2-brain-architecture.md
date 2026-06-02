# Odysseus v2 — 类脑 Agent 运行时 · 完整设计文档

> 确认日期：2026-05-30
> 状态：设计阶段

---

## 一、MISSION

构建一个类脑自主 Agent 运行时。

不是另一个 LLM 工具链，而是一个会学习、会记忆、会感受、会预测、会自我调节的智能系统。

**当前 Agent 框架的本质**是 LLM 循环：推理 → 调用 → 结果 → 推理。每一步都是无状态的、无记忆的、无成长的。第一万次和第一次没有区别。

**我们相信** Agent 应该像大脑一样工作：稀疏激活、关联记忆、情感驱动、习惯形成、预测执行。用得越多，越快、越省、越准。

**五大核心能力：**

1. **关联记忆** — 稀疏神经元网络，激活扩散回忆，不存储记录而存储连接。自然遗忘，无需定时器。
2. **双脑思维** — 左脑分析推理，右脑直觉创造，胼胝体协调统一。每个问题得到两个视角。
3. **情感驱动** — 杏仁核亚毫秒级情感评估，快速通路绕过 LLM。情感标记驱动记忆重要性。
4. **运动演化** — 工具调用随练习从推理变为习惯，从习惯变为反射。越用越快，越用越省。自动发现模式，自动创造新工具。
5. **自我调节** — 下丘脑管理资源与稳态，星形胶质细胞缓存，类淋巴系统清理。长期运行不会崩溃，不会内存爆炸。

**第一个实例：** Odysseus — 个人 AI 伴侣。基于框架构建，验证全部五大能力。能记住你，能感受对话氛围，能预测你需要什么，能越用越懂你。

**成功指标：**

- 运行 7 天不重启，内存不增长 — 自我调节
- 第 100 次任务比第 1 次快 10x — 运动演化
- 回忆准确率 > 90%，无需全量扫描 — 关联记忆
- 情感评估延迟 < 50ms — 情感驱动
- 任何单结构崩溃，系统继续运行 — 容错

---

## 二、核心原则

1. **突触原则** — 每个结构边界都是格式转换，不只是传数据
2. **稀疏原则** — 任意时刻只有被激活的神经元参与计算
3. **信号原则** — 信息在传递中变化格式，格式的差异就是计算
4. **能量原则** — 资源有限，下丘脑统一调度，非必要不激活
5. **路由原则** — 丘脑是唯一路由器，结构间不直接通信

---

## 三、架构总览

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                    ODYSSEUS v2 · 类脑架构                                ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                         ║
║  ┌──────────────────── 端 脑 ──────────────────────┐                    ║
║  │                                                  │                    ║
║  │   左脑(LLM)          白质层          右脑(LLM)   │                    ║
║  │   ┌─────────┐    ┌──────────┐    ┌─────────┐    │                    ║
║  │   │ 额叶(左)│    │          │    │ 额叶(右)│    │                    ║
║  │   │ 顶叶(左)│◄──►│ 胼胝体   │◄──►│ 顶叶(右)│    │                    ║
║  │   │ 颞叶(左)│    │ 弓状束   │    │ 颞叶(右)│    │                    ║
║  │   │ 枕叶(左)│    │ 钩束     │    │ 枕叶(右)│    │                    ║
║  │   └─────────┘    │ 上下行束 │    └─────────┘    │                    ║
║  │                  └──────────┘                    │                    ║
║  │                                                  │                    ║
║  │   ┌──────────┐  ┌────────────┐                  │                    ║
║  │   │ 基底核   │  │ 边缘系统   │                  │                    ║
║  │   │          │  │ ┌────────┐ │                  │                    ║
║  │   │ 动作选择 │  │ │海马体  │ │                  │                    ║
║  │   │ 奖赏评估 │  │ │情景编码│ │                  │                    ║
║  │   │ 习惯学习 │  │ │模式补全│ │                  │                    ║
║  │   │          │  │ └────────┘ │                  │                    ║
║  │   │          │  │ ┌────────┐ │                  │                    ║
║  │   │          │  │ │杏仁核  │ │                  │                    ║
║  │   │          │  │ │情感标记│ │                  │                    ║
║  │   │          │  │ │快速评估│ │                  │                    ║
║  │   │          │  │ └────────┘ │                  │                    ║
║  │   └──────────┘  └────────────┘                  │                    ║
║  └──────────────────────────────────────────────────┘                    ║
║                          │ 白质                                          ║
║  ┌───────────────────────┼───────────────────────────┐                   ║
║  │                 间 脑                              │                   ║
║  │         丘脑(路由)  下丘脑(能量)                   │                   ║
║  └───────────────────────┼───────────────────────────┘                   ║
║                     白质 │                                                ║
║  ┌───────────────────────┼───────────────────────────┐                   ║
║  │           脑 干              小 脑                  │                   ║
║  │      永不停歇循环         前馈预测·误差修正        │                   ║
║  │      感觉通道接入         期望vs实际               │                   ║
║  └────────────────────────────────────────────────────┘                   ║
║                                                                         ║
║  ┌────────────────────────────────────────────────────┐                   ║
║  │           神经元层 · 稀疏联想记忆网络              │                   ║
║  │           权重=记忆强度  连接=关联  激活=回忆      │                   ║
║  └────────────────────────────────────────────────────┘                   ║
║                                                                         ║
║  ┌────────────────────────────────────────────────────┐                   ║
║  │           能量与支持系统                            │                   ║
║  │  星形胶质细胞(缓存) · 类淋巴系统(清理)             │                   ║
║  │  血脑屏障(保护) · ATP分配(资源)                    │                   ║
║  └────────────────────────────────────────────────────┘                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## 四、信息传递系统

大脑中信息不是一种格式从头传到尾，是在每个突触经历电→化→电的格式转换。每次格式转换都不是简单翻译，是有损的、选择性的、可塑的计算。

```
生物学                    Odysseus 映射
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
动作电位              →   事件触发 (emit)
轴突传导              →   事件总线传输
突触前终末囊泡释放    →   事件序列化 + 类型标注
神经递质跨突触间隙    →   事件 payload 投递
突触后受体结合        →   事件处理器匹配 (on/once)
兴奋/抑制电位         →   正权重/负权重信号
信号整合              →   加权聚合 → 触发下一级决策
```

---

## 五、信号系统 — 架构的神经系统

每种信号格式是一个类型定义，每个格式转换是一个纯函数（突触）。

### 信号类型定义

```
第一层：脑干 → 丘脑
════════════════════════════
SensorySignal {
  source:       'cli' | 'webhook' | 'telegram' | 'code' | 'socket'
  modality:     'text' | 'command' | 'event' | 'error'
  raw:          string
  intensity:    0..1        // 信号强度
  timestamp:    number
}

第二层：丘脑 → 皮层 / 杏仁核
════════════════════════════
RoutedSignal {
  target:           'frontal' | 'parietal' | 'temporal' | 'occipital'
  content:          string      // 已过滤的内容
  modality:         string
  attentionWeight:  0..1        // 注意力权重（丘脑调节）
  priority:         'low' | 'normal' | 'high' | 'critical'
  timestamp:        number
}

快速通路：丘脑 → 杏仁核（不走 LLM）
═══════════════════════════════════════
EmotionalTag {
  valence:      -1..+1      // 负(消极) 到 正(积极)
  arousal:      0..1        // 平静 到 极度兴奋
  urgency:      0..1        // 紧急度
  threat:       0..1        // 威胁等级
  opportunity:  0..1        // 机会等级
  source:       string
}

第三层：杏仁核 + 丘脑 → 海马体
════════════════════════════════
TaggedExperience {
  content:          string
  emotionalWeight:  number    // 来自杏仁核
  valence:          number
  arousal:          number
  context:          string[]  // 关键上下文标签
  timestamp:        number
}

第四层：海马体 → 神经元层
════════════════════════════
WeightUpdate {
  sourceNeurons:      string[]
  targetNeurons:      string[]
  deltaWeights:       number[]
  consolidationScore: 0..1   // 巩固评分
  connectionType:     'excitatory' | 'inhibitory'
}

第五层：额叶 → 基底核
════════════════════════
ActionCandidate {
  action:          string
  expectedReward:  0..1
  confidence:      0..1
  riskLevel:       0..1
  reasoning:       string    // 额叶的推理过程
  context:         string[]
}

第六层：基底核 → 小脑
════════════════════════
MotorPlan {
  action:            string
  predictedOutcome:  string
  timeline:          number    // 预计执行时间 ms
  expectedStates:    Array<{
    step:        number
    description: string
    confidence:  number
  }>
}

第七层：小脑 → 基底核 + 额叶（反馈）
═══════════════════════════════════════
ErrorSignal {
  expected:    string
  actual:      string
  magnitude:   0..1         // 误差幅度
  direction:   'overestimate' | 'underestimate'
  adjustment:  Array<{
    target:  string         // 基底核习惯 / 额叶策略
    delta:   number
    reason:  string
  }>
}

神经元激活信号（回忆过程）
══════════════════════════
ActivationSignal {
  neuronId:         string
  activationLevel:  0..1
  trigger:          string
  spreadTo:         Array<{
    targetId: string
    weight:   number
  }>
}
```

### 突触转换函数

```
每个突触 = 一个纯函数：输入格式 → 输出格式

Synapse<I, O> = (input: I, context: SystemState) => O

脑干 → 丘脑：    SensorySignal       → RoutedSignal
丘脑 → 杏仁核：  RoutedSignal        → EmotionalTag（纯计算，无LLM）
杏仁核+皮层 → 海马体：[EmotionalTag, RoutedSignal] → TaggedExperience
海马体 → 神经元： TaggedExperience    → WeightUpdate
额叶 → 基底核：   CortexOutput        → ActionCandidate[]
基底核 → 小脑：   ActionCandidate     → MotorPlan
小脑 → 反馈：     [MotorPlan, Actual] → ErrorSignal
```

---

## 六、六条信息通路

```
通路 ① 感知通路（外界→意识）
────────────────────────────
外界输入 → 脑干接收 → 丘脑路由
  ├→ 枕叶: 编码特征
  ├→ 顶叶: 空间+注意力分配
  ├→ 颞叶: 语言+模式匹配
  └→ 额叶: 理解+决策

通路 ② 情感快速通路（绕过皮层）
──────────────────────────────
外界输入 → 脑干 → 丘脑 ──(粗略信号)──→ 杏仁核 → 立即反应
                       ↓
                     皮层处理 (慢速精确)
                       ↓
                     杏仁核修正 (二次评估)

通路 ③ 记忆巩固通路
──────────────────
体验 → 海马体编码
     ← 杏仁核附加情感权重
     → 神经元层形成长期连接
     ← 小脑提供时序序列
     ← 基底核标记奖赏/惩罚

通路 ④ 决策执行通路
──────────────────
额叶生成候选方案
  → 基底核评估选择（多巴胺奖赏信号）
  → 小脑预测各方案结果（前馈模型）
  → 额叶最终决策
  → 执行
  → 小脑比较 期望 vs 实际
  → 误差信号 → 基底核调整习惯权重

通路 ⑤ 左右脑协调通路
────────────────────
左脑 ←── 白质(胼胝体) ──→ 右脑
  ·信息同步: 分析结果 ↔ 直觉判断
  ·冲突抑制: 一侧抑制另一侧相悖信号
  ·任务路由: 逻辑→左脑 / 模式→右脑
  ·人格统一: 两半球合并为统一意识

通路 ⑥ 能量调节通路
──────────────────
下丘脑监控:
  ·token/算力消耗 = 血糖水平
  ·记忆容量压力 = 饥饿感
  ·处理负载     = 体温
  ·交互间隔     = 昼夜节律
  资源匮乏 → 星形胶质细胞释放缓存 → 抑制非必要活动
  空闲期   → 类淋巴系统启动 → GC + 权重修剪 + 废弃连接清除
  资源充裕 → 激活探索·学习·记忆巩固
```

---

## 七、神经递质映射

```
递质            生物作用              Odysseus 映射
──────────────────────────────────────────────────────
多巴胺          奖赏·动机·学习        任务成功→权重增强
Dopamine        (基底核→皮层)         用户满意→正强化

去甲肾上腺素    唤醒·警觉·注意力      紧急输入→优先级提升
NE              (脑干→全脑)           错误发生→警觉模式

血清素          情绪·饱和·社交        情感状态调节
Serotonin       (脑干→全脑)           长时间空闲→平静模式

乙酰胆碱        注意·学习·记忆        巩固期激活
ACh             (基底前脑→皮层)       新知识→高可塑性

GABA(抑制)      抑制·过滤·降噪       无关信号过滤
                (全脑)                注意力聚焦

谷氨酸(兴奋)    激活·主递质           激活传播
Glutamate       (全脑)                神经元触发链
```

---

## 八、各结构详细设计

### 脑干 Brainstem

```
职责：进程保活 + 感觉通道接入 + 基本反射
技术：确定性循环，无 LLM
实现：Elixir GenServer

输入：外部事件（用户消息、webhook、定时器）
输出：SensorySignal → 白质 → 丘脑

关键行为：
· perceive→reason→act→reflect→evolve 永不停歇循环
· 基本反射：不需要皮层的即时响应（ping、health、echo）
· RAS(网状激活系统)：控制全局唤醒水平
  - 高唤醒：紧急模式，所有信号高优先级
  - 低唤醒：节能模式，只处理关键信号
· 信号接入：将各种通道的原始输入统一为 SensorySignal
· Supervisor 树：保活所有子结构，崩溃自动重启
```

### 丘脑 Thalamus

```
职责：信号路由 + 注意力门控 + 快速通路切换
技术：确定性路由 + 权重计算，无 LLM
实现：Elixir GenServer

输入：SensorySignal（来自脑干）
输出：RoutedSignal → 白质 → 各叶皮层
      EmotionalTag → 白质 → 杏仁核（快速通路）

关键行为：
· 路由决策：根据 modality + intensity 决定信号送给哪个叶
  - text + 高intensity → 额叶(左) 逻辑分析
  - text + 高arousal → 额叶(右) 直觉判断
  - command → 顶叶 路由处理
  - event → 枕叶 模式识别
· 快速通路：intensity > 0.8 或 threat 标记 → 同时发给杏仁核
· 注意力门控：attentionWeight < 阈值的信号被过滤
· 意识门控：低优先级信号不进入皮层处理（类似睡眠时丘脑阻断信号）
```

### 下丘脑 Hypothalamus

```
职责：资源管理 + 稳态维持 + 状态切换
技术：确定性监控，无 LLM
实现：Elixir gen_statem

监控指标：
· tokenBudget:      剩余可用 token 数（= 血糖水平）
· computeLoad:      当前处理负载（= 体温）
· memoryPressure:   神经元层连接密度（= 饥饿感）
· interactionGap:   距上次交互时间（= 昼夜节律）

稳态行为：
· tokenBudget < 20%  → 星形胶质细胞释放缓存
· computeLoad > 80%  → 抑制非必要活动
· memoryPressure > 阈值 → 触发类淋巴清理
· interactionGap > 5min → 切换到空闲模式
· interactionGap > 30min → 切换到睡眠模式

状态机：
  ACTIVE ──(idle)──→ IDLE ──(30min)──→ SLEEP ──(input)──→ ACTIVE
    │                  │                    │
    │                  └──(input)──→ ACTIVE │
    └── 做轻度巩固                          └── 做深度巩固+类淋巴清理
```

### 杏仁核 Amygdala

```
职责：快速情感评估 + 威胁检测 + 情感标记
技术：纯计算（关键词+规则+模式匹配），无 LLM，毫秒级
实现：Elixir GenServer + Rust NIF（模式匹配部分）

快速通路评估（< 50ms）：
· 威胁检测：错误信号、负面关键词、异常模式 → threat ↑
· 机会检测：表扬、成功信号、新模式 → opportunity ↑
· 情感标记：给信号打 valence + arousal 标签

输出：
· EmotionalTag → 海马体（标记记忆的重要性）
· EmotionalTag → 额叶（影响决策倾向）
· 紧急时 → 直接触发脑干反射（绕过皮层）

可学习：
· 什么模式产生什么情感 → 通过基底核的多巴胺反馈学习
· 初期用规则，后续用习惯
```

### 海马体 Hippocampus

```
职责：情景编码 + 模式分离/补全 + 短期→长期巩固
技术：稀疏编码算法 + 激活扩散，无 LLM
实现：Elixir GenServer + Rust NIF（编码算法）

输入：TaggedExperience（来自杏仁核+皮层）
输出：WeightUpdate → 神经元层（异步）

关键算法：
· 模式分离：相似但不相同的体验编码到不同神经元群
  - 避免记忆混淆
  - 用正交化编码
· 模式补全：部分线索激活完整记忆
  - 输入线索 → 激活扩散 → 找到最强匹配
  - 这就是"回忆"过程
· 巩固：TaggedExperience → 提取特征 → 生成 WeightUpdate
  - emotionalWeight 高的 → 更高的 consolidationScore
  - 重复出现的模式 → 强化已有连接（不创建新连接）
  - 新模式 → 创建新连接

回忆过程（非查询）：
  输入线索 → 编码为激活模式 → 在神经元层扩散激活
  → 达到阈值的神经元群被"点亮" → 读取其连接的上下文
  → 这就是回忆到的内容

与 v1 的根本区别：
  v1: storeEpisode(obj) → Map[id] = obj → getRecent(n) → 遍历返回
  v2: encode(experience) → 权重更新 → recall(cue) → 激活扩散
```

### 基底核 Basal Ganglia

```
职责：动作选择 + 奖赏学习 + 习惯形成 + 运动程序存储
技术：竞争选择 + 多巴胺权重更新，无 LLM
实现：Elixir GenServer + Rust NIF（数值计算）

输入：ActionCandidate[]（来自额叶）
输出：选中的 ActionCandidate → 小脑

动作选择机制：
· 直接通路：每个候选的 expectedReward × confidence → 得分
· 间接通路：抑制低分候选（GABA 抑制）
· 最终：得分最高的被选中，其余被抑制

多巴胺学习：
· 动作执行后，比较实际结果 vs 预期
· 超出预期 → 多巴胺释放 → 强化该动作的习惯权重
· 低于预期 → 多巴胺下降 → 减弱习惯权重
· 来自小脑的 ErrorSignal 驱动这个过程

习惯形成与运动程序：
· 同一动作在相似情境下反复成功 → 权重趋近 1.0
· 习惯化的动作不再需要额叶推理 → 直接由基底核触发
· 节省 token（不需要 LLM 参与已掌握的行为）

运动程序层级：
  层级 0 — 工具原语（内置，类似脊髓反射）
    read_file, write_file, exec_shell, search_web

  层级 1 — 简单动作（从经验中学习）
    "找到函数定义" = read_file + grep + 定位行号

  层级 2 — 复合技能（动作组合）
    "修 bug" = 定位 + 理解 + 修改 + 验证

  层级 3 — 工作流（技能编排）
    "做 PR" = 修bug + 写测试 + 提交 + 创建PR

  层级 4 — 项目级能力（工作流组合）
    "交付功能" = 需求分析 + 设计 + 实现 + 测试 + 文档

越高层的程序，越多 LLM 参与。越低层，越不需要 LLM。
```

### 小脑 Cerebellum

```
职责：前馈预测 + 误差修正 + 时序编排
技术：前馈模型 + 误差计算，无 LLM
实现：Elixir GenServer + Rust NIF（预测模型）

输入：MotorPlan（来自基底核的选中动作）
输出：ErrorSignal → 基底核 + 额叶

前馈预测：
· 给定当前状态 + 动作 → 预测执行后的状态
· 不需要真正执行，是内部模拟
· 基于历史经验（神经元层中的时序连接）

误差修正：
· 动作实际执行后：actual vs predicted
· 误差大 → ErrorSignal.magnitude 高 → 基底核大幅调整
· 误差小 → 微调

时序编排：
· 复杂动作拆解为步骤序列
· 每步有预期状态和时序
· 确保动作按正确顺序执行

预测加速：
· 小脑预测工具执行结果 → 如果预测吻合 → 减少结果处理
· 如果预测不吻合 → 误差信号 → 学习
· 多步预测 → LLM 不需要等工具返回就能规划下一步
```

### 皮层 — 四叶

```
额叶 Frontal Lobe（调用 LLM）
  职责：规划·推理·决策·目标管理
  实现：TypeScript (LLM SDK 调用)
  输入：RoutedSignal + EmotionalTag + 回忆内容(来自海马体)
  输出：ActionCandidate[] → 基底核
  左脑侧重：逻辑分析、精确推理、语言产出
  右脑侧重：创造性方案、直觉判断、大局观

顶叶 Parietal Lobe（确定性计算为主）
  职责：注意力分配·空间上下文·输入整合
  实现：Elixir GenServer
  输入：RoutedSignal
  输出：注意力权重更新 → 丘脑
  功能：决定当前关注什么，忽略什么

颞叶 Temporal Lobe（调用 LLM + 确定性混合）
  职责：语言理解·模式匹配·记忆检索触发
  实现：Elixir GenServer + TypeScript (LLM 辅助)
  输入：RoutedSignal
  输出：回忆线索 → 海马体
  功能：将输入转化为回忆线索，触发海马体模式补全

枕叶 Occipital Lobe（确定性计算）
  职责：输入编码·特征提取·预处理
  实现：Elixir GenServer + Rust NIF
  输入：RoutedSignal
  输出：编码后的特征 → 顶叶/颞叶
  功能：将原始输入转化为结构化特征表示
```

### 白质层 White Matter

```
职责：所有结构间的通信基础设施
技术：Elixir 进程间消息传递 + Rust NIF（高性能计算调用）
实现：Elixir GenServer 路由

设计：
· 每条"束"（tract）是一个类型安全的通道
· 发送方只能发送该束允许的信号类型
· 接收方只能接收该束注册的处理器
· 信号在传输中不改变格式（格式转换在突触中完成）

束（tracts）定义：
· corpusCallosum:    左脑 ↔ 右脑（胼胝体）
· thalamicRadiation: 丘脑 ↔ 皮层（丘脑辐射）
· fornix:            海马体 ↔ 其他结构（穹窿）
· amygdalofugal:     杏仁核 ↔ 海马体/下丘脑（杏仁核传出）
· cerebellothalamic: 小脑 ↔ 丘脑（小脑丘脑束）
· dopaminePathway:   基底核 → 各结构（多巴胺通路）
```

### 神经元层 Neuron Layer

```
职责：长期记忆存储 + 激活扩散回忆
技术：稀疏邻接矩阵 + Hebbian 学习
实现：Rust NIF（核心计算）+ Elixir GenServer（接口）

数据结构：
  neurons: Map<NeuronId, {
    features: Float64Array      // 特征向量（稀疏）
    activationThreshold: number // 激活阈值
    lastActivated: number       // 上次激活时间
  }>

  connections: SparseMatrix     // 稀疏邻接矩阵
    [sourceId][targetId] = {
      weight: number            // 0-1 连接强度
      type: 'excitatory' | 'inhibitory'
      createdAt: number
      reinforcedAt: number
    }

回忆过程：
  1. 海马体传入线索 → 编码为特征向量
  2. 在 neurons 中找到特征最相似的 k 个神经元（k=5~10）
  3. 激活这些神经元（activationLevel = similarity）
  4. 沿 connections 扩散激活（weight × activationLevel 衰减）
  5. 扩散 2-3 跳后停止
  6. activationLevel > threshold 的神经元群 = "回忆到的内容"
  7. 读取这些神经元的 features + 连接上下文

学习过程（Hebbian）：
  · 两个神经元同时被激活 → 连接 weight += Δ
  · Δ 与两者 activationLevel 的乘积成正比
  · 不被激活的连接 → weight 自然衰减（每次 tick × decay_rate）
  · weight < 0.01 → 连接被删除（突触消失）

稀疏性保证：
  · 任意时刻只有被激活的神经元参与计算
  · 新增体验 → 只更新相关神经元的连接
  · 回忆 → 只激活少量神经元，不遍历全部
  · 内存占用 = O(活跃连接数) 而不是 O(总记忆数)
```

### 能量与支持系统

```
星形胶质细胞 Astrocyte
  职责：资源缓存·应急释放·预分配
  实现：Elixir GenServer + ETS

  · 糖原储存(能量缓存) → 预取 token 缓存 + 响应结果缓存
  · 乳酸穿梭(应急供能) → 资源预分配
  · 突触修剪辅助       → 协助类淋巴系统
  · 血脑屏障构成       → API 速率限制 + 资源保护

类淋巴系统 Glymphatic
  职责：空闲期清理·权重修剪·连接回收
  实现：Elixir GenServer + Task + Rust NIF（矩阵操作）

  · 睡眠时清除代谢废物 → idle期GC + 内存释放
  · 清除β淀粉样蛋白   → dream期权重修剪
  · 脑脊液循环清洗     → sleep期清除废弃连接
  ·                    → 定期压缩神经元网络
```

---

## 九、运动程序 — 工具使用的演化

工具调用不应该永远是推理任务，它应该能变成运动技能。

```
演化过程：

Phase 1 — 新手（皮层全权处理）
  额叶推理: "用户要我修复这个bug"
  → LLM 分析需要哪些工具
  → 逐个调用: read_file → 分析 → edit_file → 验证
  → 每一步都需要 LLM 推理
  → 慢 · 贵 · 容易出错

Phase 2 — 学习（小脑开始预测）
  小脑记住: "read_file 打开 .ts 文件 → 通常会看到 import 语句"
  → 下次执行前，小脑预测结果
  → 如果预测吻合 → 减少结果处理时间
  → 如果预测不吻合 → 误差信号 → 学习

Phase 3 — 习惯（基底核接管）
  基底核记录: "修 .ts 文件的 bug → 100次中 92 次是这个流程"
  → 不再需要额叶推理
  → 直接执行运动程序: read → locate → edit → verify
  → 无 LLM 参与 → 快 · 省 token · 确定性

Phase 4 — 自动化（脑干反射）
  极高频的操作变成反射:
  → "创建文件" "读文件某行" "检查类型"
  → 完全自动，和打字一样不经过思考
```

运动程序数据结构：

```
MotorProgram {
  name:            string          // "fix_ts_bug"
  trigger:         object          // 触发条件 {context: "typescript", task: "bug_fix"}
  steps:           ActionStep[]    // 动作序列
  confidence:      0..1            // 成功率
  execution_count: number          // 执行次数
  last_used:       timestamp       // 上次使用时间
  created_from:    string[]        // 由哪些经验归纳而来
}
```

工具创造——基底核发现模式：
- "过去 50 次，你在修改 .tsx 文件后都执行了 tsc --noEmit"
- → 自动创建运动程序 "tsx_save_verify"
- → 以后每次保存 .tsx 自动触发类型检查
- → 不需要 LLM 提醒，不需要配置

---

## 十、技术架构 — Elixir/BEAM + Rust NIF + TypeScript

### 语言选择理由

```
Elixir/BEAM — 神经系统层
  ·BEAM 进程 ~300 字节 → 百万级轻量进程 = 神经元
  ·Actor 模型 = 天然的神经元通信模型
  ·Supervisor 树 = 天然的脑干保活机制
  ·"Let it crash" = 局部脑损伤不影响全局
  ·Hot code reloading = 不停机学习更新
  ·分布式是原生的 → 跨机器部署零改动
  ·OTP gen_statem = 下丘脑状态机开箱即用
  ·无 STW → 不会像 Go GC 那样暂停所有处理

Rust NIF — 计算核心层
  ·Elixir 调用 Rust 就像调用普通函数
  ·零拷贝，直接内存交互
  ·函数调用级延迟（纳秒）
  ·Rust 计算在 BEAM 调度器之外 → 不阻塞其他进程
  ·无 GC — 杏仁核/基底核的确定性延迟
  ·所有权模型 — 神经元连接的生命周期安全
  ·SIMD/并行 — 激活扩散可并行化

TypeScript — 应用层
  ·LLM SDK 生态 — anthropic/openai SDK 原生支持
  ·prompt 管理 — 模板字面量/字符串处理便捷
  ·流式响应 — async generator 天然适配 SSE
  ·UI 生态 — ink/React 对于 TUI/Web
```

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│               Elixir/BEAM 神经系统层                        │
│                                                             │
│  每个结构是一个 GenServer/Actor                              │
│  所有通信是异步消息传递                                      │
│  Supervisor 树保证容错                                      │
│                                                             │
│  ┌──────────┐                                              │
│  │ brainstem│ Supervisor → 保活所有子结构                   │
│  │    │     │                                              │
│  │    ├── thalamus     GenServer → 路由+门控               │
│  │    ├── hypothalamus gen_statem → 状态机                 │
│  │    ├── astrocyte    GenServer → ETS 缓存               │
│  │    ├── glymphatic   GenServer → Task 定时清理           │
│  │    ├── parietal     GenServer → 注意力分配              │
│  │    ├── occipital    GenServer → 特征提取                │
│  │    └── white_matter GenServer → 进程间消息路由          │
│  └──────────┘                                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ Rust NIF (Native Implemented Function)
                               │ 零拷贝 · 纳秒延迟 · 不阻塞 BEAM 调度
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               Rust 计算核心层                                │
│                                                             │
│  ·neurons     稀疏矩阵 + 激活扩散 + Hebbian                │
│  ·hippocampus 模式分离/补全 + 编码算法                      │
│  ·amygdala    快速情感评估（< 1ms 确定性）                  │
│  ·basal       动作竞争 + 权重更新 + 运动程序                │
│  ·cerebellum  前馈预测 + 误差计算                           │
│  ·occipital   特征提取 + 编码                               │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP/WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               TypeScript 应用层                              │
│                                                             │
│  ·cortex-left   左脑 LLM（逻辑推理）                       │
│  ·cortex-right  右脑 LLM（直觉创造）                        │
│  ·frontal-orch  额叶编排（合并左右脑 + 记忆 + 情感）       │
│  ·temporal-llm  颞叶语言理解（回忆线索生成）               │
│  ·tui           终端 UI                                     │
│  ·api           HTTP/WebSocket 服务                         │
└─────────────────────────────────────────────────────────────┘
```

### 项目结构

```
odysseus-v2/
├── neural/                        # Elixir umbrella app
│   ├── mix.exs                    # umbrella root
│   ├── apps/
│   │   ├── odysseus_brain/        # 主应用 + Supervisor 树
│   │   ├── odysseus_thalamus/     # 丘脑路由
│   │   ├── odysseus_hypothalamus/ # 下丘脑稳态
│   │   ├── odysseus_amygdala/     # 杏仁核（+ Rust NIF）
│   │   ├── odysseus_hippocampus/  # 海马体（+ Rust NIF）
│   │   ├── odysseus_basal/        # 基底核（+ Rust NIF）
│   │   ├── odysseus_cerebellum/   # 小脑（+ Rust NIF）
│   │   ├── odysseus_neurons/      # 神经元层（+ Rust NIF）
│   │   ├── odysseus_white_matter/ # 白质通信层
│   │   ├── odysseus_astrocyte/    # 星形胶质细胞
│   │   └── odysseus_glymphatic/   # 类淋巴系统
│   └── config/
│       ├── config.exs
│       ├── dev.exs
│       └── prod.exs
│
├── core/                          # Rust workspace (NIF crates)
│   ├── Cargo.toml
│   ├── crates/
│   │   ├── neurons/               # 稀疏矩阵 + 激活扩散
│   │   ├── hippocampus/           # 模式分离/补全
│   │   ├── amygdala/              # 快速情感评估
│   │   ├── basal/                 # 动作选择 + 运动程序
│   │   ├── cerebellum/            # 前馈预测
│   │   ├── signal_types/          # 共享信号类型
│   │   └── sparse_matrix/         # 稀疏矩阵原语
│   └── rustler.toml
│
├── app/                           # TypeScript 应用层
│   ├── package.json
│   ├── src/
│   │   ├── cortex-left/           # 左脑 LLM
│   │   ├── cortex-right/          # 右脑 LLM
│   │   ├── frontal-orchestrator/  # 额叶编排
│   │   ├── temporal-llm/          # 颞叶语言理解
│   │   ├── tui/                   # 终端 UI
│   │   └── api/                   # HTTP/WebSocket
│   └── tsconfig.json
│
├── config/
│   └── odysseus.toml              # 全局配置
│
├── scripts/
│   ├── build.sh                   # 多语言构建
│   └── dev.sh                     # 开发模式启动
│
└── docs/
    └── design/                    # 设计文档
```

---

## 十一、如何解决 v1 的原始问题

```
问题                          v1 原因                  v2 解决方案
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
内存无限增长                  Map只增不减              稀疏网络，权重衰减=自然遗忘
启动全量加载                  SQLite→Map全量           神经元层只加载活跃连接
回忆是O(n)遍历               遍历全部episodicStore    激活扩散，O(k) k=激活数
遗忘靠定时器标记 dormant      标记但不删除             权重自然衰减到0=突触消失
叙事只增不减                  chapters append-only     巩固时压缩，旧连接自然消失
所有结构做同一件事            同一个对象传来传去       突触格式转换，各结构各司其职
单LLM处理所有问题             一个LLM做全部            左右脑分工+确定性计算处理大部分
工具调用永远靠推理            每次都是LLM函数调用      运动程序：工具使用随练习自动化
长时间运行崩溃                无容错无资源管理         BEAM Supervisor + 下丘脑稳态
```

---

## 十二、实现路线

```
Phase 1 — 基础设施（白质+信号类型）
  ·搭建 Elixir umbrella 项目 + Rust workspace
  ·定义所有信号类型（Rust signal_types crate）
  ·实现白质层（Elixir 进程间消息路由）
  ·实现突触转换函数（Rust NIF 纯函数）
  ·TypeScript 应用层脚手架

Phase 2 — 底层结构（脑干+间脑）
  ·实现脑干：接入白质，输出 SensorySignal
  ·实现丘脑：路由逻辑 + 注意力门控
  ·实现下丘脑：资源监控 + gen_statem 状态机

Phase 3 — 情感+记忆（杏仁核+海马体+神经元层）
  ·实现杏仁核：快速情感评估（Rust NIF）
  ·实现神经元层：稀疏矩阵 + 激活扩散（Rust NIF）
  ·实现海马体：模式分离/补全 + 巩固

Phase 4 — 皮层+决策（额叶+基底核+小脑）
  ·实现双 LLM 皮层（TypeScript 左右脑）
  ·实现基底核：动作选择 + 运动程序 + 习惯学习
  ·实现小脑：前馈预测 + 误差反馈
  ·实现胼胝体：左右脑协调

Phase 5 — 能量系统（星形胶质细胞+类淋巴）
  ·实现星形胶质细胞：缓存层
  ·实现类淋巴系统：空闲期清理
  ·全系统联调 + 长时间运行测试

Phase 6 — 第一个实例（Odysseus 伴侣）
  ·TUI 界面
  ·对话能力
  ·个性化记忆
  ·情感感知
```
