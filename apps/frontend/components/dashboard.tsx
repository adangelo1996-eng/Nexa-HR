"use client";

import { motion } from "framer-motion";
import { Calendar, Clock3, Workflow } from "lucide-react";

interface Props {
  todayEntriesCount: number;
  leaveResidualDays: number;
  pendingWorkflowCount: number;
}

export function Dashboard({
  todayEntriesCount,
  leaveResidualDays,
  pendingWorkflowCount
}: Props): React.JSX.Element {
  const cards = [
    { title: "Timbrature oggi", value: String(todayEntriesCount), icon: Clock3 },
    { title: "Ferie residue", value: `${leaveResidualDays} gg`, icon: Calendar },
    { title: "Workflow in attesa", value: String(pendingWorkflowCount), icon: Workflow }
  ];

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card, index) => (
        <motion.article
          key={card.title}
          className="card"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08, duration: 0.35 }}
        >
          <div className="mb-3 flex items-center justify-between">
            <card.icon className="h-5 w-5 text-cyan-300" />
            <span className="text-xs uppercase text-slate-400">Live</span>
          </div>
          <h3 className="text-sm text-slate-300">{card.title}</h3>
          <p className="mt-2 text-3xl font-semibold text-white">{card.value}</p>
        </motion.article>
      ))}
    </section>
  );
}
