import { buildRenderTree, type RenderNode } from "../src/lib/builder/tree.ts";

// Prototyp-Graph (prototyp-v4.jsx, FLAT): s1..s10
const S = (id: string, title: string, is_decision = false, position = 0) => ({
  id,
  tutorial_id: "t",
  chapter_id: null,
  title,
  body: null,
  image_path: null,
  image_width: null,
  image_height: null,
  highlights: [],
  position,
  is_decision,
  created_at: "",
});

const steps = [
  S("s1", "App öffnen", false, 1),
  S("s2", "Lädt die App korrekt?", true, 2),
  S("s3", "Sind Sie eingeloggt?", true, 3),
  S("s4", "Einloggen", false, 4),
  S("s5", "Face ID aktiv?", true, 5),
  S("s6", "Face ID einschalten", false, 6),
  S("s7", "Fertig", false, 7),
  S("s8", "App neu installieren", false, 8),
  S("s9", "Klappt es jetzt?", true, 9),
  S("s10", "Support kontaktieren", false, 10),
];

let bc = 0;
const B = (step_id: string, label: string | null, target: string | null) => ({
  id: `b${bc++}`,
  step_id,
  label,
  color: label === "Ja" ? "#0f9d72" : label === "Nein" ? "#d6455d" : null,
  target_step_id: target,
  position: bc,
  created_at: "",
});

const branches = [
  B("s1", null, "s2"),
  B("s2", "Ja", "s3"),
  B("s2", "Nein", "s8"),
  B("s3", "Ja", "s5"),
  B("s3", "Nein", "s4"),
  B("s4", null, "s5"),
  B("s5", "Ja", "s7"),
  B("s5", "Nein", "s6"),
  B("s6", null, "s7"),
  B("s8", null, "s9"),
  B("s9", "Ja", "s7"),
  B("s9", "Nein", "s10"),
];

function print(node: RenderNode | null, indent = 0) {
  const pad = "  ".repeat(indent);
  if (!node) return console.log(pad + "(leer)");
  if (node.type === "merge")
    return console.log(`${pad}↳ weiter mit: ${node.label}${node.isEnd ? " [Ende]" : ""}`);
  console.log(`${pad}[${node.step.title}]${node.branches ? "  (Frage)" : ""}`);
  if (node.branches) {
    for (const b of node.branches) {
      console.log(`${pad}  • ${b.label}:`);
      print(b.child, indent + 2);
    }
    if (node.after) {
      console.log(`${pad}  ⤵ danach:`);
      print(node.after, indent + 1);
    }
  } else if (node.next) {
    print(node.next, indent);
  }
}

print(buildRenderTree(steps as never, branches as never, "s1"));
