// Module-level file open listener system
type FileOpenListener = (path: string) => void;
const fileOpenListeners = new Set<FileOpenListener>();

export const emitOpenFile = (path: string) => fileOpenListeners.forEach(fn => fn(path));

export const onOpenFile = (fn: FileOpenListener) => {
  fileOpenListeners.add(fn);
  return () => { fileOpenListeners.delete(fn); };
};
