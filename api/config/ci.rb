CI.run do
  step "Prepare database", "bin/rails db:prepare"
  step "Autoload", "bin/rails zeitwerk:check"
  step "Rails tests", "bin/rails test"
  step "Bore parity", "env PYTHONPATH=lib/bore python3 -m pytest test/bore -q"
end
