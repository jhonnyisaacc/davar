module QahalProfile
  STARTING_QUESTIONS = %w[1 3].freeze
  EXPERIENCED_QUESTIONS = %w[1 2 3 4 5 6 7].freeze

  def self.question_ids(experience)
    experience == "starting" ? STARTING_QUESTIONS : EXPERIENCED_QUESTIONS
  end
end
