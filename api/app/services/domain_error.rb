class DomainError < StandardError
  attr_reader :code, :status
  def initialize(code, status = 422)
    @code, @status = code, status
    super(code)
  end
end
