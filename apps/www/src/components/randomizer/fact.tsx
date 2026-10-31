import { MicroLabel } from "./primitives";

export const Fact = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div>
    <MicroLabel className='mb-2'>{label}</MicroLabel>
    {children}
  </div>
);
