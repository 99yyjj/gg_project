// HTML 정화 유틸.
// dangerouslySetInnerHTML로 그리는 description(AI 생성/사용자 입력)에 섞인
// <script> 등 악성 마크업을 제거해 XSS를 막는다.
// SSR 환경에서도 안전하도록 isomorphic 버전을 사용한다.

import DOMPurify from "isomorphic-dompurify";

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty);
}
