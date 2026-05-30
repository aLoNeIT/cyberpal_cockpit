/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare module 'markstream-vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{
    content: string;
    speed?: number;
  }>;
  export default component;
}

declare module 'v-code-diff' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{
    oldString: string;
    newString: string;
    language?: string;
    context?: number;
    outputFormat?: 'side-by-side' | 'line-by-line';
    diffStyle?: 'word' | 'char';
  }>;
  export default component;
}
