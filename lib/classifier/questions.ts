import questionsV1 from "@/config/classification.questions.v1.json";

export interface EnumOption {
  value: string;
  label: string;
}

export interface ClassificationQuestion {
  key: string;
  order: number;
  type: "bool" | "enum";
  prompt: string;
  help: string;
  citation: string;
  options?: EnumOption[];
}

export const CLASSIFICATION_QUESTIONNAIRE_VERSION = questionsV1.version;
export const CLASSIFICATION_LEGAL_NOTICE = questionsV1.legal_notice;

export function classificationQuestions(): ClassificationQuestion[] {
  return (questionsV1.questions as ClassificationQuestion[])
    .slice()
    .sort((a, b) => a.order - b.order);
}
