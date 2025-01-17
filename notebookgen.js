const fs = require("fs");
const path = require("path");
const spawn = require("child_process").spawn;
const through2 = require("through2");
const tmp = require("tmp");
const os = require("os");

const section = ["\\section{", "\\subsection{", "\\subsubsection{"];
const extensions = {
  ".cc": "C++",
  ".cpp": "C++",
  ".hpp": "C++",
  ".c": "c",
  ".java": "java",
  ".py": "python",
  ".tex": "tex",
  ".go": "golang",
};

function walk(_path, depth) {
  let ans = "";
  depth = Math.min(depth, section.length - 1);
  fs.readdirSync(_path).forEach(function (file) {
    if (file.startsWith(".")) {
      return; // hidden directory
    }
    const f = path.resolve(_path, file);
    const stat = fs.lstatSync(f);
    if (stat.isDirectory()) {
      ans += "\n" + section[depth] + file + "}\n" + walk(f, depth + 1);
    } else if (path.extname(f) in extensions) {
      ans += "\n" + section[depth] + file.split(".")[0] + "}\n";
      if (path.extname(f) !== ".tex") {
        ans +=
          `\\begin{minted}{${extensions[path.extname(f)]}}\n` +
          fs.readFileSync(f) +
          "\\end{minted}\n";
      } else {
        ans += fs.readFileSync(f);
      }
    }
  });
  return ans;
}

/**
 * pdf must be generated twice in order to generate the table of contents.
 * According to some tests, in windows it must be generated 3 times.
 * */
function genpdf(ans, texPath, tmpobj) {
  const tex = spawn("latexmk", ["-xelatex", "-shell-escape", texPath], {
    cwd: tmpobj.name,
    env: process.env,
  });

  tex.on("error", function (err) {
    console.error(err);
  });

  tex.on("exit", function (code, signal) {
    const outputFile = texPath.split(".")[0] + ".pdf";
    fs.access(outputFile, function (err) {
      if (err) {
        return console.error("Not generated " + code + " : " + signal);
      }
      const s = fs.createReadStream(outputFile);
      s.pipe(ans);
      s.on("close", function () {
        tmpobj.removeCallback();
      });
    });
  });
}

function latexmk(doc) {
  const tmpobj = tmp.dirSync({ unsafeCleanup: true });
  const texPath = path.join(tmpobj.name, "_notebook.tex");

  const ans = through2();
  ans.readable = true;
  const input = fs.createWriteStream(texPath);
  input.end(doc);
  input.on("close", function () {
    genpdf(ans, texPath, tmpobj);
  });

  return ans;
}

// function normalizeUnixStyle(currentPath) {
//   if (os.type() === "Windows_NT") {
//     return currentPath.replace(/\\/g, "/");
//   }
//   return currentPath;
// }

function templateParameter(parameter) {
  return `\${${parameter}}`;
}

module.exports = function (_path, options) {
  options.output = options.output || "./notebook.pdf";
  options.author = options.author || "";
  options.initials = options.initials || "";

  if (!options.size.endsWith("pt")) options.size += "pt";
  // if (options.image) {
  //   options.image = normalizeUnixStyle(path.resolve(options.image));
  //   options.image =
  //     "\\centering{\\includegraphics[width=3.5cm]{" + options.image + "}}";
  // } else {
  //   options.image = "";
  // }

  let template = fs
    .readFileSync(path.join(__dirname, "template_header.tex"))
    .toString();
  template = template
    .replaceAll(templateParameter("author"), options.author)
    .replaceAll(templateParameter("initials"), options.initials)
    .replaceAll(templateParameter("fontSize"), options.size)
    .replaceAll(templateParameter("columns"), options.columns)
    .replaceAll(templateParameter("paper"), options.paper)
    .replaceAll(templateParameter("image"), options.image);

  template += walk(_path, 0);
  template += "\\end{multicols}\n";
  template += "\\end{document}";
  latexmk(template).pipe(fs.createWriteStream(options.output));
};
