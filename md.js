const mds = ["Resume.md"];

mds.forEach(async (md) => {
  const str = await fetch(md).then((res) => res.text());
  const div = document.createElement("div");
  div.className = "markdown-body";
  div.innerHTML = markdown.default(str);
  document.getElementById("resume").appendChild(div);
});
