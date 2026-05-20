const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// 1. Move directories
function moveDir(src, dest) {
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest);
    console.log(`Moved ${src} to ${dest}`);
  }
}

function moveFiles(src, dest) {
    if (fs.existsSync(src)) {
        const files = fs.readdirSync(src);
        for(const file of files) {
            fs.renameSync(path.join(src, file), path.join(dest, file));
        }
        fs.rmdirSync(src);
        console.log(`Moved contents of ${src} to ${dest}`);
    }
}

moveDir(path.join(srcDir, 'pages'), path.join(srcDir, 'presentation', 'pages'));
moveDir(path.join(srcDir, 'components'), path.join(srcDir, 'presentation', 'components'));
moveDir(path.join(srcDir, 'context'), path.join(srcDir, 'presentation', 'context'));
moveFiles(path.join(srcDir, 'types'), path.join(srcDir, 'domain'));

// Delete empty legacy dirs
const toDelete = ['api', 'services'];
toDelete.forEach(d => {
    const p = path.join(srcDir, d);
    if(fs.existsSync(p)) fs.rmdirSync(p);
});

// 2. Fix imports
function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walk(filepath, callback);
    } else if (filepath.endsWith('.ts') || filepath.endsWith('.tsx')) {
      callback(filepath);
    }
  }
}

function replaceInFile(filepath, replacements) {
    let content = fs.readFileSync(filepath, 'utf8');
    let original = content;
    for(const [search, replace] of replacements) {
        content = content.replace(search, replace);
    }
    if (content !== original) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`Updated imports in ${filepath}`);
    }
}

walk(srcDir, (filepath) => {
    // Relative to src
    const relPath = path.relative(srcDir, filepath).replace(/\\/g, '/');
    
    // Global replace for 'types' -> 'domain'
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Rules based on where the file is now:
    if (relPath.startsWith('presentation/')) {
        // Was at depth 1 (e.g. pages/Dashboard.tsx), now at depth 2 (presentation/pages/Dashboard.tsx)
        // Imports going to src/ (like ../infrastructure, ../application, ../types) need an extra ../
        content = content.replace(/(from\s+['"])\.\.\/infrastructure/g, '$1../../infrastructure');
        content = content.replace(/(from\s+['"])\.\.\/application/g, '$1../../application');
        // If it was ../types, it goes to src/types, but types is now domain, so ../../domain
        content = content.replace(/(from\s+['"])\.\.\/types/g, '$1../../domain');
        // If it was importing from components or context or pages (sibling legacy folders), it was ../components, now it's ../components (same depth inside presentation!)
        // So ../components remains ../components.
        fs.writeFileSync(filepath, content, 'utf8');
    } else {
        // App.tsx, main.tsx, or infrastructure/application files
        // Replace ./pages -> ./presentation/pages
        content = content.replace(/(from\s+['"])\.\/pages/g, '$1./presentation/pages');
        content = content.replace(/(from\s+['"])\.\/components/g, '$1./presentation/components');
        content = content.replace(/(from\s+['"])\.\/context/g, '$1./presentation/context');
        
        // Replace ../types -> ../domain
        content = content.replace(/(from\s+['"])\.\.\/types/g, '$1../domain');
        fs.writeFileSync(filepath, content, 'utf8');
    }
});

console.log("Migration complete.");
