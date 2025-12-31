import { useTranslation } from "react-i18next";

export const FAQSection: React.FC = () => {
  const { t } = useTranslation();

  const faqs = [
    {
      id: 1,
      questionKey: "faq.questions.whatIs.question",
      answerKey: "faq.questions.whatIs.answer",
    },
    {
      id: 2,
      questionKey: "faq.questions.howToInstall.question",
      answerType: "list" as const,
      steps: [
        "faq.questions.howToInstall.answer.step1",
        "faq.questions.howToInstall.answer.step2",
        "faq.questions.howToInstall.answer.step3",
        "faq.questions.howToInstall.answer.step4",
      ],
    },
    {
      id: 3,
      questionKey: "faq.questions.isSafe.question",
      answerKey: "faq.questions.isSafe.answer",
    },
    {
      id: 4,
      questionKey: "faq.questions.howToUninstall.question",
      answerKey: "faq.questions.howToUninstall.answer",
    },
    {
      id: 5,
      questionKey: "faq.questions.platforms.question",
      answerKey: "faq.questions.platforms.answer",
    },
    {
      id: 6,
      questionKey: "faq.questions.reportBug.question",
      answerType: "link" as const,
      answerKey: "faq.questions.reportBug.answer",
      linkKey: "faq.questions.reportBug.answerLink",
      suffixKey: "faq.questions.reportBug.answerSuffix",
      href: "https://github.com/Stormix/deadlock-modmanager/issues/new?labels=bug&template=bug-report---.md",
    },
    {
      id: 7,
      questionKey: "faq.questions.documentation.question",
      answerType: "link" as const,
      answerKey: "faq.questions.documentation.answer",
      linkKey: "faq.questions.documentation.answerLink",
      suffixKey: "faq.questions.documentation.answerSuffix",
      href: "https://docs.deadlockmods.app/",
    },
    {
      id: 8,
      questionKey: "faq.questions.officialSkins.question",
      answerKey: "faq.questions.officialSkins.answer",
    },
    {
      id: 9,
      questionKey: "faq.questions.othersSeeSkins.question",
      answerKey: "faq.questions.othersSeeSkins.answer",
    },
  ];

  return (
    <section className='bg-background' id='faq'>
      <div className='mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20'>
        <div className='mx-auto max-w-2xl text-center'>
          <h2 className='mb-2 text-center text-lg text-primary tracking-wider'>
            {t("faq.sectionLabel")}
          </h2>
          <h2 className='mb-6 text-center font-bold font-primary text-3xl sm:mb-8 md:text-4xl'>
            {t("faq.sectionTitle")}
          </h2>
          <p className='mt-4 text-sm text-muted-foreground sm:mt-6 sm:text-base/7'>
            {t("faq.sectionDescription")}{" "}
            <a
              href='https://docs.deadlockmods.app/using-mod-manager/faq'
              className='font-semibold text-primary hover:text-primary/80'
              rel='noopener'
              target='_blank'>
              {t("faq.comprehensiveFaq")}
            </a>{" "}
            {t("faq.orReachOut")}{" "}
            <a
              href='https://github.com/Stormix/deadlock-modmanager/issues/new'
              className='font-semibold text-primary hover:text-primary/80'
              rel='noopener'
              target='_blank'>
              {t("faq.creatingIssue")}
            </a>
            .
          </p>
        </div>
        <div className='mt-12 sm:mt-16 lg:mt-20'>
          <dl className='space-y-12 sm:grid sm:grid-cols-2 sm:space-y-0 sm:gap-x-6 sm:gap-y-12 lg:gap-x-10 lg:gap-y-16'>
            {faqs.map((faq) => (
              <div key={faq.id}>
                <dt className='text-sm font-semibold text-foreground sm:text-base/7'>
                  {t(faq.questionKey)}
                </dt>
                <dd className='mt-2 text-sm text-muted-foreground sm:text-base/7'>
                  {faq.answerType === "list" && faq.steps ? (
                    <ol className='list-inside list-decimal space-y-2'>
                      {faq.steps.map((stepKey) => (
                        <li key={stepKey}>{t(stepKey)}</li>
                      ))}
                    </ol>
                  ) : faq.answerType === "link" ? (
                    <span>
                      {t(faq.answerKey)}{" "}
                      <a
                        className='font-semibold text-primary hover:text-primary/80'
                        href={faq.href}
                        rel='noopener'
                        target='_blank'>
                        {t(faq.linkKey!)}
                      </a>
                      {faq.suffixKey && ` ${t(faq.suffixKey)}`}
                    </span>
                  ) : (
                    t(faq.answerKey!)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};
