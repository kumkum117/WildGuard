import { motion } from 'framer-motion';
import ResponseHero from '../components/Deterrence/ResponseHero';
import DeterrenceControl from '../components/Deterrence/DeterrenceControl';
import SpeciesPlaybook from '../components/Deterrence/SpeciesPlaybook';
import SystemStatus from '../components/Deterrence/SystemStatus';
import VillagerBroadcast from '../components/Deterrence/VillagerBroadcast';
import EngagementLog from '../components/Deterrence/EngagementLog';

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function DeterrencePage() {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="deterrence-page"
    >
      <motion.div variants={item}>
        <ResponseHero />
      </motion.div>
      <motion.div variants={item}>
        <DeterrenceControl />
      </motion.div>
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <SpeciesPlaybook className="lg:col-span-2" />
        <SystemStatus />
      </motion.div>
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 items-start">
        <VillagerBroadcast />
        <EngagementLog />
      </motion.div>
    </motion.div>
  );
}
