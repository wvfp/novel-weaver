export interface StyleImprint {
  name: string;
  source: string;
  charCount: number;
  analyzedAt: string;
  styleProfile: {
    avgSentenceLength: number;
    avgParagraphLength: number;
    dialogueRatio: number;
    topBigrams: [string, number][];
    topWords: [string, number][];
    chapterStartPatterns: string[];
    chapterEndPatterns: string[];
    sentenceLengthDist: number[];
    paragraphCharDist: number[];
    punctuationFreq: Record<string, number>;
  };
  representativePassages: {
    label: string;
    text: string;
    tags: string[];
  }[];
  aiStyleSummary: string;
  active: boolean;
}
