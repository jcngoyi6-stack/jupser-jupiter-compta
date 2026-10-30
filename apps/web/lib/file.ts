/** Lit un fichier choisi par l'utilisateur : CSV en texte, XLSX en base64. */
export async function readFileForApi(file: File): Promise<{ content?: string; base64?: string; fileName: string }> {
  if (/\.xlsx$/i.test(file.name)) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(bin), fileName: file.name };
  }
  return { content: await file.text(), fileName: file.name };
}
