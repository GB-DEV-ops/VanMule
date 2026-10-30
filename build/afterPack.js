// Sets the VanMule icon and version details on the Windows .exe without needing Wine.
const path = require('path');
const fs = require('fs');
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const R = require('resedit');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const exeObj = R.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = R.NtExecutableResource.from(exeObj);
  const ico = R.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = R.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  R.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));
  const vis = R.Resource.VersionInfo.fromEntries(res.entries);
  if (vis.length) {
    const vi = vis[0];
    const langs = vi.getAllLanguagesForStringValues();
    const l = langs[0] || { lang: 1033, codepage: 1200 };
    vi.setStringValues(l, { ProductName: 'VanMule', FileDescription: 'VanMule', CompanyName: 'VanMule', OriginalFilename: 'VanMule.exe', InternalName: 'VanMule', LegalCopyright: '' });
    vi.setFileVersion(1, 0, 0, 0, l.lang);
    vi.setProductVersion(1, 0, 0, 0, l.lang);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(exeObj);
  fs.writeFileSync(exe, Buffer.from(exeObj.generate()));
  console.log('  • VanMule icon and version info applied');
};
