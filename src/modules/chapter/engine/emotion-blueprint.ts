/**
 * 情绪蓝图生成器
 *
 * 根据章纲和上下文生成章节的情绪曲线和场景情绪规划。
 * 输出结构供 PlotWriter 写作时参考。
 */

// ============================================================
// 类型定义
// ============================================================

/** 情绪主调 */
export type DominantEmotion =
  | '悲壮' | '紧张' | '爽' | '温馨' | '压抑' | '悬疑' | '激昂' | '虐心';

/** 情绪曲线段 */
export interface EmotionCurveSection {
  section: number;       // 段落序号
  label: string;         // 段落标签（如"开端"、"冲突"）
  intensity: number;     // 强度 0-1
  technique: string;     // 写作技巧描述
}

/** 场景情绪 */
export interface SceneEmotion {
  sceneNum: number;      // 场景序号
  mood: DominantEmotion | string;  // 情绪基调
  pacing: '舒缓' | '紧凑' | '紧张'; // 节奏
  sensoryFocus: string;  // 感官焦点
  tensionTechnique: string; // 张力技巧
}

/** 情绪蓝图 */
export interface EmotionBlueprint {
  dominantEmotion: DominantEmotion;
  emotionCurve: EmotionCurveSection[];
  sceneEmotions: SceneEmotion[];
  chapterVibe: string;
}

// ============================================================
// 情绪模板
// ============================================================

/** 各情绪主调的默认曲线模板 */
const EMOTION_TEMPLATES: Record<DominantEmotion, EmotionCurveSection[]> = {
  '悲壮': [
    { section: 1, label: '铺垫', intensity: 0.3, technique: '平静前奏，暗示不祥' },
    { section: 2, label: '冲突', intensity: 0.6, technique: '矛盾升级，命运对决' },
    { section: 3, label: '高潮', intensity: 0.9, technique: '牺牲/离别，情绪爆发' },
    { section: 4, label: '余韵', intensity: 0.4, technique: '沉重余波，留白回味' },
  ],
  '紧张': [
    { section: 1, label: '压迫', intensity: 0.5, technique: '紧迫感铺垫，倒数计时' },
    { section: 2, label: '危机', intensity: 0.7, technique: '障碍涌现，步步紧逼' },
    { section: 3, label: '爆发', intensity: 0.9, technique: '正面交锋，高潮对决' },
    { section: 4, label: '喘息', intensity: 0.3, technique: '危机暂缓，但未解除' },
  ],
  '爽': [
    { section: 1, label: '压抑', intensity: 0.2, technique: '对手嚣张，主角隐忍' },
    { section: 2, label: '反转', intensity: 0.6, technique: '主角亮牌，形势逆转' },
    { section: 3, label: '爆发', intensity: 0.9, technique: '碾压对手，情绪释放' },
    { section: 4, label: '余韵', intensity: 0.5, technique: '收获时刻，读者满足' },
  ],
  '温馨': [
    { section: 1, label: '日常', intensity: 0.4, technique: '温暖细节，生活气息' },
    { section: 2, label: '升温', intensity: 0.6, technique: '互动加深，默契展现' },
    { section: 3, label: '高潮', intensity: 0.8, technique: '情感表达，感动瞬间' },
    { section: 4, label: '尾声', intensity: 0.5, technique: '温暖收尾，余温不散' },
  ],
  '压抑': [
    { section: 1, label: '阴郁', intensity: 0.4, technique: '灰暗氛围，无力感笼罩' },
    { section: 2, label: '绝望', intensity: 0.7, technique: '困境加深，出路无望' },
    { section: 3, label: '深渊', intensity: 0.9, technique: '绝境降临，情绪塌陷' },
    { section: 4, label: '微光', intensity: 0.3, technique: '一丝希望但不确定' },
  ],
  '悬疑': [
    { section: 1, label: '异象', intensity: 0.3, technique: '异常信号，引起好奇' },
    { section: 2, label: '探索', intensity: 0.5, technique: '线索浮现，真假难辨' },
    { section: 3, label: '揭示', intensity: 0.8, technique: '部分真相，更大谜团' },
    { section: 4, label: '钩子', intensity: 0.6, technique: '关键反转，待下回分解' },
  ],
  '激昂': [
    { section: 1, label: '集结', intensity: 0.5, technique: '力量汇聚，战意升腾' },
    { section: 2, label: '冲锋', intensity: 0.7, technique: '以弱战强，热血沸腾' },
    { section: 3, label: '激战', intensity: 0.9, technique: '酣畅淋漓，高光时刻' },
    { section: 4, label: '凯旋', intensity: 0.6, technique: '胜利荣光，余韵激昂' },
  ],
  '虐心': [
    { section: 1, label: '美好', intensity: 0.4, technique: '幸福铺垫，美好回忆' },
    { section: 2, label: '裂痕', intensity: 0.6, technique: '裂缝出现，悲伤预兆' },
    { section: 3, label: '破碎', intensity: 0.9, technique: '理想破灭，情绪崩溃' },
    { section: 4, label: '余痛', intensity: 0.5, technique: '伤痛延续，读者共鸣' },
  ],
};

// ============================================================
// 主函数
// ============================================================

/**
 * 根据情绪主调获取默认曲线模板。
 */
function getDefaultCurve(emotion: DominantEmotion): EmotionCurveSection[] {
  return EMOTION_TEMPLATES[emotion] ?? EMOTION_TEMPLATES['紧张'];
}

/**
 * 根据章节号推断章节阶段。
 */
function inferStage(chapterNum: number): string {
  if (chapterNum <= 3) return '开端';
  if (chapterNum <= 8) return '发展';
  if (chapterNum <= 12) return '高潮';
  return '收尾';
}

/**
 * 从章纲字符串推断情绪主调。
 */
function inferEmotionFromOutline(outline: string): DominantEmotion {
  const keywordMap: Record<string, DominantEmotion> = {
    '牺牲': '悲壮', '离别': '悲壮', '死亡': '悲壮',
    '紧张': '紧张', '危机': '紧张', '追杀': '紧张',
    '打脸': '爽', '碾压': '爽', '逆袭': '爽',
    '温馨': '温馨', '日常': '温馨', '温暖': '温馨',
    '压抑': '压抑', '绝望': '压抑', '困境': '压抑',
    '悬疑': '悬疑', '谜团': '悬疑', '猜测': '悬疑',
    '热血': '激昂', '战斗': '激昂', '爆发': '激昂',
    '虐': '虐心', '误会': '虐心', '背叛': '虐心',
  };

  for (const [keyword, emotion] of Object.entries(keywordMap)) {
    if (outline.includes(keyword)) return emotion;
  }

  return '紧张'; // 默认
}

/**
 * 从章纲生成情绪蓝图。
 *
 * @param outline - 章节大纲文本
 * @param context - 额外上下文（预留参数，用于后续扩展）
 * @returns 情绪蓝图
 */
export function generateEmotionBlueprint(
  outline: string,
  context: string,
): EmotionBlueprint {
  const dominantEmotion = inferEmotionFromOutline(outline);
  const curve = getDefaultCurve(dominantEmotion);
  const stage = inferStage(1); // TODO: 从 context 获取真实章节号

  const sceneEmotions: SceneEmotion[] = curve.map((section, index) => ({
    sceneNum: index + 1,
    mood: index === 2 ? dominantEmotion : (dominantEmotion === '紧张' ? '紧张' : dominantEmotion),
    pacing: section.intensity > 0.7 ? '紧张' : section.intensity > 0.4 ? '紧凑' : '舒缓',
    sensoryFocus: index === 0 ? '环境' : index === 2 ? '动作' : '心理',
    tensionTechnique: section.technique,
  }));

  const chapterVibe = `${dominantEmotion}为主调，${stage}章节` +
    `，共 ${curve.length} 个情绪段落` +
    `，情绪峰值在第 ${curve.findIndex((s) => s.intensity >= 0.9) + 1 || 3} 段`;

  return {
    dominantEmotion,
    emotionCurve: curve,
    sceneEmotions,
    chapterVibe,
  };
}
