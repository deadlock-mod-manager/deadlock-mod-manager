export function Remling({ sleeping = false }: { sleeping?: boolean }) {
  return (
    <svg aria-hidden='true' viewBox='0 0 64 64' className='remlock-remling'>
      <path
        d='M12 40 6 13 22 25Q32 18 42 25L58 13 52 40Q56 57 32 59 8 57 12 40Z'
        fill='currentColor'
      />
      <path d='M23 24Q24 5 39 5L47 19 38 16 39 25Z' fill='hsl(233 98% 80%)' />
      <circle cx='47' cy='19' r='4' fill='hsl(42 100% 75%)' />
      {sleeping ? (
        <path
          d='M17 40Q22 46 27 40M37 40Q42 46 47 40'
          fill='none'
          stroke='hsl(193 90% 88%)'
          strokeWidth='3'
          strokeLinecap='round'
        />
      ) : (
        <>
          <ellipse cx='22' cy='41' rx='5' ry='6' fill='hsl(193 90% 88%)' />
          <ellipse cx='42' cy='41' rx='5' ry='6' fill='hsl(193 90% 88%)' />
        </>
      )}
    </svg>
  );
}
