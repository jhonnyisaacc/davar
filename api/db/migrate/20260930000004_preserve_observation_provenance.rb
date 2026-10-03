class PreserveObservationProvenance < ActiveRecord::Migration[8.1]
  def change
    add_column :new_moon_observations, :provenance, :jsonb, null: false, default: {}
  end
end
