import { Editor as EditorComponent } from "./Editor";
import { EditorTypePreview } from "./EditorTypePreview";
import { EditorTypeSelect } from "./EditorTypeSelect";

const EditorTypes = Object.assign(EditorComponent, {
  Editor: EditorComponent,
  Select: EditorTypeSelect,
  Preview: EditorTypePreview,
});

export type { EditorProps } from "./Editor";
export { EditorTypes };
