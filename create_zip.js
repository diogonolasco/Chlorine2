const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const zipPath = path.resolve(__dirname, 'chlorine_shardcloud.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const output = fs.createWriteStream(zipPath);
const archive = new ZipArchive({
  zlib: { level: 9 }
});

output.on('close', () => {
  console.log(`ZIP criado com sucesso! Tamanho: ${fs.statSync(zipPath).size} bytes`);
  
  // Validação estrita do ZIP
  const buf = fs.readFileSync(zipPath);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdRecords = buf.readUInt16LE(eocd + 10);
  let pos = cdOffset;
  let backslashes = 0;
  const names = [];
  for (let i = 0; i < cdRecords; i++) {
    const magic = buf.readUInt32LE(pos);
    if (magic !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    names.push(name);
    if (name.includes('\\')) {
      backslashes++;
      console.error(`[ALERTA] Caminho inválido com barra invertida: ${name}`);
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  console.log(`Total de arquivos no ZIP: ${names.length}`);
  console.log(`Barras invertidas encontradas: ${backslashes}`);
  if (backslashes === 0) {
    console.log('✅ Validação de segurança POSIX 100% aprovada para ShardCloud/Linux!');
  }
});

archive.on('error', (err) => {
  console.error('Erro ao empacotar:', err);
  process.exit(1);
});

archive.pipe(output);

const baseDir = path.resolve(__dirname, 'upload_shardcloud');

function addDirectory(currentDir, zipPrefix) {
  const items = fs.readdirSync(currentDir);
  for (const item of items) {
    if (item === 'node_modules' || item.endsWith('.log') || item.endsWith('.tmp')) continue;
    const fullPath = path.join(currentDir, item);
    const entryName = zipPrefix ? `${zipPrefix}/${item}` : item;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addDirectory(fullPath, entryName);
    } else {
      const cleanName = entryName.split(path.sep).join('/');
      archive.file(fullPath, { name: cleanName });
    }
  }
}

addDirectory(baseDir, '');
archive.finalize();
