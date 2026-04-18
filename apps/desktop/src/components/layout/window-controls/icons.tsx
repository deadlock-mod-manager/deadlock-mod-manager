export const Icons = {
  MinimizeWin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='12'
      height='12'
      viewBox='0 0 12 12'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <path
        d='M2.5 6.5H9.5'
        stroke='currentColor'
        strokeWidth='1.75'
        strokeLinecap='round'
      />
    </svg>
  ),

  MaximizeWin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='12'
      height='12'
      viewBox='0 0 12 12'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <rect
        x='2.625'
        y='2.625'
        width='6.75'
        height='6.75'
        rx='1.5'
        stroke='currentColor'
        strokeWidth='1.75'
      />
    </svg>
  ),

  MaximizeRestoreWin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='12'
      height='12'
      viewBox='0 0 12 12'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <path
        d='M4 4V3.25A1.25 1.25 0 0 1 5.25 2H8.75A1.25 1.25 0 0 1 10 3.25V6.75A1.25 1.25 0 0 1 8.75 8H8'
        stroke='currentColor'
        strokeWidth='1.75'
        strokeLinecap='round'
      />
      <rect
        x='2'
        y='4'
        width='6'
        height='6'
        rx='1.25'
        stroke='currentColor'
        strokeWidth='1.75'
      />
    </svg>
  ),

  CloseWin: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='12'
      height='12'
      viewBox='0 0 12 12'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <path
        d='M3 3L9 9M9 3L3 9'
        stroke='currentColor'
        strokeWidth='1.75'
        strokeLinecap='round'
      />
    </svg>
  ),

  closeMac: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='6'
      height='6'
      viewBox='0 0 16 18'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <path
        d='M15.7522 4.44381L11.1543 9.04165L15.7494 13.6368C16.0898 13.9771 16.078 14.5407 15.724 14.8947L13.8907 16.728C13.5358 17.0829 12.9731 17.0938 12.6328 16.7534L8.03766 12.1583L3.44437 16.7507C3.10402 17.091 2.54132 17.0801 2.18645 16.7253L0.273257 14.8121C-0.0807018 14.4572 -0.0925004 13.8945 0.247845 13.5542L4.84024 8.96087L0.32499 4.44653C-0.0153555 4.10619 -0.00355681 3.54258 0.350402 3.18862L2.18373 1.35529C2.53859 1.00042 3.1013 0.989533 3.44164 1.32988L7.95689 5.84422L12.5556 1.24638C12.8951 0.906035 13.4587 0.917833 13.8126 1.27179L15.7267 3.18589C16.0807 3.53985 16.0925 4.10346 15.7522 4.44381Z'
        fill='currentColor'
      />
    </svg>
  ),

  minMac: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='8'
      height='8'
      viewBox='0 0 17 6'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <g clipPath='url(#clip0_20_2051)'>
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M1.47211 1.18042H15.4197C15.8052 1.18042 16.1179 1.50551 16.1179 1.90769V3.73242C16.1179 4.13387 15.8052 4.80006 15.4197 4.80006H1.47211C1.08665 4.80006 0.773926 4.47497 0.773926 4.07278V1.90769C0.773926 1.50551 1.08665 1.18042 1.47211 1.18042Z'
          fill='currentColor'
        />
      </g>
    </svg>
  ),

  fullMac: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='6'
      height='6'
      viewBox='0 0 15 15'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <g clipPath='url(#clip0_20_2057)'>
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M3.53068 0.433838L15.0933 12.0409C15.0933 12.0409 15.0658 5.35028 15.0658 4.01784C15.0658 1.32095 14.1813 0.433838 11.5378 0.433838C10.6462 0.433838 3.53068 0.433838 3.53068 0.433838ZM12.4409 15.5378L0.87735 3.93073C0.87735 3.93073 0.905794 10.6214 0.905794 11.9538C0.905794 14.6507 1.79024 15.5378 4.43291 15.5378C5.32535 15.5378 12.4409 15.5378 12.4409 15.5378Z'
          fill='currentColor'
        />
      </g>
    </svg>
  ),

  plusMac: (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      width='8'
      height='8'
      viewBox='0 0 17 16'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
      {...props}>
      <g clipPath='url(#clip0_20_2053)'>
        <path
          fillRule='evenodd'
          clipRule='evenodd'
          d='M15.5308 9.80147H10.3199V15.0095C10.3199 15.3949 9.9941 15.7076 9.59265 15.7076H7.51555C7.11337 15.7076 6.78828 15.3949 6.78828 15.0095V9.80147H1.58319C1.19774 9.80147 0.88501 9.47638 0.88501 9.07419V6.90619C0.88501 6.50401 1.19774 6.17892 1.58319 6.17892H6.78828V1.06183C6.78828 0.676375 7.11337 0.363647 7.51555 0.363647H9.59265C9.9941 0.363647 10.3199 0.676375 10.3199 1.06183V6.17892H15.5308C15.9163 6.17892 16.229 6.50401 16.229 6.90619V9.07419C16.229 9.47638 15.9163 9.80147 15.5308 9.80147Z'
          fill='currentColor'
        />
      </g>
    </svg>
  ),
};
